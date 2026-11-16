import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

export type FeedHandler = (request: IncomingMessage, response: ServerResponse) => void;

const tls = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'tls', name), 'utf8');

export const TEST_CA = tls('cert.pem');

export interface FeedServer {
  readonly origin: string;
  readonly requests: IncomingMessage[];
  route(path: string, handler: FeedHandler): void;
  close(): Promise<void>;
}

export const startFeedServer = async (secure = true): Promise<FeedServer> => {
  const routes = new Map<string, FeedHandler>();
  const requests: IncomingMessage[] = [];
  const handle = (request: IncomingMessage, response: ServerResponse): void => {
    requests.push(request);
    const handler = routes.get(new URL(request.url ?? '/', 'http://x').pathname);
    if (handler === undefined) {
      response.writeHead(404).end();
      return;
    }
    handler(request, response);
  };
  const server: Server = secure
    ? createHttpsServer({ key: tls('key.pem'), cert: TEST_CA }, handle)
    : createHttpServer(handle);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `${secure ? 'https' : 'http'}://127.0.0.1:${String(port)}`,
    requests,
    route: (path, handler) => {
      routes.set(path, handler);
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};
