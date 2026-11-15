import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { REALTIME_PATH } from '@relay/shared/realtime';
import { type WebSocket, WebSocketServer } from 'ws';
import {
  ACCESS_TOKEN_AUTHENTICATOR,
  type AccessTokenAuthenticator,
} from '../auth/session/access-token-authenticator';
import { DeviceRevocations } from '../auth/session/device-revocations';
import { DomainEventBus } from '../events/domain-event-bus';
import { ConnectionRegistry } from './connection-registry';
import { Heartbeat } from './heartbeat';
import { RealtimeSession } from './realtime-session';

export const REALTIME_OPTIONS = Symbol.for('relay.server.RealtimeOptions');

export interface RealtimeOptions {
  readonly heartbeatMs: number;
  readonly helloTimeoutMs: number;
  readonly maxPayloadBytes: number;
}

@Injectable()
export class RealtimeServer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly wss: WebSocketServer;
  private readonly heartbeats = new Map<WebSocket, Heartbeat>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly registry: ConnectionRegistry,
    private readonly bus: DomainEventBus,
    private readonly revocations: DeviceRevocations,
    @Inject(ACCESS_TOKEN_AUTHENTICATOR) private readonly authenticator: AccessTokenAuthenticator,
    @Inject(REALTIME_OPTIONS) private readonly options: RealtimeOptions,
  ) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: options.maxPayloadBytes });
  }

  onApplicationBootstrap(): void {
    const server = this.adapterHost.httpAdapter.getHttpServer() as {
      on(
        event: 'upgrade',
        listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void,
      ): void;
    };
    server.on('upgrade', (request, socket, head) => {
      this.upgrade(request, socket, head);
    });
    this.wss.on('connection', (socket) => {
      this.accept(socket);
    });
    this.unsubscribers.push(
      this.bus.subscribe((userId, event) => {
        this.registry.publish(userId, event);
      }),
      this.revocations.subscribe((deviceId) => {
        this.registry.disconnectDevice(deviceId);
      }),
    );
    this.heartbeatTimer = setInterval(() => {
      this.heartbeats.forEach((heartbeat) => {
        heartbeat.beat();
      });
    }, this.options.heartbeatMs);
  }

  onModuleDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
    }
    this.wss.clients.forEach((client) => {
      client.terminate();
    });
    this.wss.close();
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (pathOf(request.url) !== REALTIME_PATH) {
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  private accept(socket: WebSocket): void {
    socket.on('error', () => {
      socket.terminate();
    });
    this.heartbeats.set(socket, new Heartbeat(socket));
    socket.on('close', () => {
      this.heartbeats.delete(socket);
    });
    new RealtimeSession(socket, this.authenticator, this.registry, {
      helloTimeoutMs: this.options.helloTimeoutMs,
    });
  }
}

const pathOf = (url: string | undefined): string | null => {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
};
