import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

export const FEED_CA_FILE = join(import.meta.dirname, '..', 'fixtures', 'cert.pem');

export interface FeedServer {
  readonly origin: string;
  readonly requests: IncomingMessage[];
  close(): Promise<void>;
}

export const startFeedServer = async (
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<FeedServer> => {
  const requests: IncomingMessage[] = [];
  const server = createServer(
    {
      key: readFileSync(join(import.meta.dirname, '..', 'fixtures', 'key.pem')),
      cert: readFileSync(FEED_CA_FILE),
    },
    (request, response) => {
      requests.push(request);
      handler(request, response);
    },
  );
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `https://127.0.0.1:${String(port)}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};
