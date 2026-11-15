import { timingSafeEqual } from 'node:crypto';
import { chmod, rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import type { MailToolBackend } from '../backend/mail-tool-backend';
import { JsonLineChannel } from './json-line-channel';
import { dispatchSocketRequest } from './socket-dispatcher';
import { HelloSchema, SocketRequestSchema } from './socket-protocol';

export interface MailToolSocketHostOptions {
  readonly path: string;
  readonly token: string;
  readonly backend: MailToolBackend;
}

export class MailToolSocketHost {
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();

  constructor(private readonly options: MailToolSocketHostOptions) {}

  async listen(): Promise<void> {
    await rm(this.options.path, { force: true });
    const server = createServer((socket) => {
      this.accept(socket);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.path, () => {
        resolve();
      });
    });
    await chmod(this.options.path, 0o600);
    this.server = server;
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
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    const channel = new JsonLineChannel(socket);
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
