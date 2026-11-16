import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: IncomingMessage['headers'];
  readonly body: unknown;
}

export interface StubReply {
  readonly status: number;
  readonly body?: unknown;
}

export type StubHandler = (request: StubRequest) => StubReply;

export interface GoogleApiStub {
  readonly baseUrl: string;
  readonly requests: StubRequest[];
  handle(handler: StubHandler): void;
  close(): Promise<void>;
}

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? null : (JSON.parse(text) as unknown);
};

export const startGoogleApiStub = async (): Promise<GoogleApiStub> => {
  const requests: StubRequest[] = [];
  let handler: StubHandler = () => ({ status: 500, body: { error: { message: 'unhandled' } } });
  const server: Server = createServer((request, response) => {
    void readBody(request).then((body) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const recorded = {
        method: request.method ?? 'GET',
        path: decodeURIComponent(url.pathname.replace(/^\/calendar\/v3/, '')),
        query: url.searchParams,
        headers: request.headers,
        body,
      };
      requests.push(recorded);
      const reply = handler(recorded);
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${String(port)}/calendar/v3`,
    requests,
    handle: (next) => {
      handler = next;
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
