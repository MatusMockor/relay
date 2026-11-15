import { ClientMessageSchema, type ServerMessage } from '@relay/shared/realtime';
import { type RawData, WebSocket } from 'ws';
import type { AccessTokenAuthenticator } from '../auth/session/access-token-authenticator';
import type { ConnectionRegistry } from './connection-registry';
import { POLICY_VIOLATION, RealtimeConnection } from './realtime-connection';

export interface RealtimeSessionOptions {
  readonly helloTimeoutMs: number;
}

export class RealtimeSession {
  private connection: RealtimeConnection | null = null;
  private authenticating = false;
  private disposed = false;
  private readonly helloTimer: NodeJS.Timeout;

  constructor(
    private readonly socket: WebSocket,
    private readonly authenticator: AccessTokenAuthenticator,
    private readonly registry: ConnectionRegistry,
    options: RealtimeSessionOptions,
  ) {
    this.helloTimer = setTimeout(() => {
      this.reject('unauthorized', 'Expected hello');
    }, options.helloTimeoutMs);
    socket.on('message', (data) => {
      this.handle(data).catch(() => {
        this.reject('internal', 'Realtime session failed');
      });
    });
    socket.on('close', () => {
      this.dispose();
    });
  }

  private async handle(data: RawData): Promise<void> {
    const parsed = ClientMessageSchema.safeParse(decode(data));
    if (!parsed.success) {
      this.reject('validation_failed', 'Invalid realtime message');
      return;
    }
    const message = parsed.data;
    if (message.type === 'ping') {
      this.sendRaw({ type: 'pong', nonce: message.nonce });
      return;
    }
    await this.authenticate(message.accessToken);
  }

  private async authenticate(accessToken: string): Promise<void> {
    if (this.connection !== null || this.authenticating) {
      this.reject('validation_failed', 'Already authenticated');
      return;
    }
    this.authenticating = true;
    const principal = await this.authenticator.authenticate(accessToken).finally(() => {
      this.authenticating = false;
    });
    clearTimeout(this.helloTimer);
    if (!this.open()) {
      return;
    }
    if (principal === null) {
      this.reject('unauthorized', 'Invalid access token');
      return;
    }
    const connection = new RealtimeConnection(this.socket, principal.userId, principal.deviceId);
    this.connection = connection;
    this.registry.add(connection);
    const confirmed = await this.authenticator.authenticate(accessToken);
    if (!this.open()) {
      return;
    }
    if (confirmed === null) {
      this.reject('unauthorized', 'Invalid access token');
      return;
    }
    connection.open({ type: 'welcome', userId: principal.userId, deviceId: principal.deviceId });
  }

  private open(): boolean {
    return !this.disposed && this.socket.readyState === WebSocket.OPEN;
  }

  private reject(code: 'unauthorized' | 'validation_failed' | 'internal', message: string): void {
    this.sendRaw({ type: 'error', code, message });
    this.socket.close(POLICY_VIOLATION, message);
  }

  private sendRaw(message: ServerMessage): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private dispose(): void {
    this.disposed = true;
    clearTimeout(this.helloTimer);
    if (this.connection !== null) {
      this.registry.remove(this.connection);
    }
  }
}

const toBuffer = (data: RawData): Buffer => {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  return data;
};

const decode = (data: RawData): unknown => {
  try {
    return JSON.parse(toBuffer(data).toString('utf8'));
  } catch {
    return null;
  }
};
