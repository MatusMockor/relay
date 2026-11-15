import { timingSafeEqual } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import type { MailToolBackend } from '../backend/mail-tool-backend';
import { JsonLineChannel } from './json-line-channel';
import { dispatchSocketRequest } from './socket-dispatcher';
import { removeStaleSocket, restrictToOwner, type RestrictAccess } from './socket-endpoint';
import { HelloSchema, SocketRequestSchema } from './socket-protocol';

export interface MailToolSocketHostOptions {
  readonly path: string;
  readonly token: string;
  readonly backend: MailToolBackend;
  readonly maxFrameBytes?: number;
  readonly restrictAccess?: RestrictAccess;
}

const DEFAULT_HOST_MAX_FRAME_BYTES = 4 * 1024 * 1024;

export class MailToolSocketHost {
  private server: Server | null = null;
  private started = false;
  private readonly sockets = new Set<Socket>();

  constructor(private readonly options: MailToolSocketHostOptions) {}

  async listen(): Promise<void> {
    if (this.started) {
      throw new Error('Mail tool socket host is already listening');
    }
    this.started = true;
    try {
      await this.bind();
    } catch (error) {
      this.started = false;
      throw error;
    }
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server === null) {
      return;
    }
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    await rm(this.options.path, { force: true });
    this.started = false;
  }

  private async bind(): Promise<void> {
    await removeStaleSocket(this.options.path);
    const server = createServer((socket) => {
      this.accept(socket);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.path, () => {
        resolve();
      });
    });
    this.server = server;
    try {
      await (this.options.restrictAccess ?? restrictToOwner)(this.options.path);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    const channel = new JsonLineChannel(
      socket,
      this.options.maxFrameBytes ?? DEFAULT_HOST_MAX_FRAME_BYTES,
    );
    let authenticated = false;
    channel.onMessage((message) => {
      if (authenticated) {
        void this.respond(channel, message);
        return;
      }
      authenticated = this.authenticate(channel, message);
    });
  }

  private authenticate(channel: JsonLineChannel, message: unknown): boolean {
    const hello = HelloSchema.safeParse(message);
    if (!hello.success || !sameToken(hello.data.token, this.options.token)) {
      channel.send({ type: 'rejected', message: 'Invalid mail tools token' });
      channel.close();
      return false;
    }
    channel.send({ type: 'ready' });
    return true;
  }

  private async respond(channel: JsonLineChannel, message: unknown): Promise<void> {
    const request = SocketRequestSchema.safeParse(message);
    if (!request.success) {
      channel.send({ id: 0, ok: false, error: 'Invalid request' });
      return;
    }
    try {
      const result = await dispatchSocketRequest(this.options.backend, request.data);
      channel.send({ id: request.data.id, ok: true, result });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Mail tool request failed';
      channel.send({ id: request.data.id, ok: false, error: text });
    }
  }
}

function sameToken(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
