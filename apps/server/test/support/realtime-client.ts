import { API_VERSION } from '@relay/shared/api';
import { REALTIME_PATH, type ServerMessage, ServerMessageSchema } from '@relay/shared/realtime';
import { assert } from 'vitest';
import { WebSocket } from 'ws';

export interface RealtimeClient {
  readonly messages: ServerMessage[];
  readonly closed: Promise<number>;
  send(message: object): void;
  waitFor(
    predicate: (message: ServerMessage) => boolean,
    timeoutMs?: number,
  ): Promise<ServerMessage>;
  close(): void;
}

export const connectRealtime = async (baseUrl: string): Promise<RealtimeClient> => {
  const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}${REALTIME_PATH}`);
  const messages: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  socket.on('message', (data: Buffer) => {
    messages.push(ServerMessageSchema.parse(JSON.parse(data.toString('utf8'))));
    waiters.forEach((wake) => {
      wake();
    });
  });
  const closed = new Promise<number>((resolve) => {
    socket.on('close', (code) => {
      resolve(code);
    });
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => {
      resolve();
    });
    socket.once('error', reject);
  });
  return {
    messages,
    closed,
    send: (message) => {
      socket.send(JSON.stringify(message));
    },
    waitFor: async (predicate, timeoutMs = 10_000) => {
      const match = await waitForMatch(messages, waiters, predicate, timeoutMs);
      if (match === null) {
        assert.fail(`Timed out waiting for a realtime message, got ${JSON.stringify(messages)}`);
      }
      return match;
    },
    close: () => {
      socket.close();
    },
  };
};

export const authenticateRealtime = async (
  baseUrl: string,
  accessToken: string,
): Promise<RealtimeClient> => {
  const client = await connectRealtime(baseUrl);
  client.send({ type: 'hello', apiVersion: API_VERSION, accessToken });
  await client.waitFor((message) => message.type === 'welcome');
  return client;
};

const waitForMatch = (
  messages: readonly ServerMessage[],
  waiters: Set<() => void>,
  predicate: (message: ServerMessage) => boolean,
  timeoutMs: number,
): Promise<ServerMessage | null> =>
  new Promise((resolve) => {
    const finish = (match: ServerMessage | null): void => {
      waiters.delete(wake);
      clearTimeout(timer);
      resolve(match);
    };
    const wake = (): void => {
      const match = messages.find(predicate);
      if (match !== undefined) {
        finish(match);
      }
    };
    const timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);
    waiters.add(wake);
    wake();
  });
