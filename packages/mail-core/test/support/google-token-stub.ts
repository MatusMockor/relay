import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface GoogleTokenStub {
  readonly url: string;
  readonly requests: URLSearchParams[];
  respondWith(response: StubResponse): void;
  close(): Promise<void>;
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks).toString('utf8');
};

export const startGoogleTokenStub = async (): Promise<GoogleTokenStub> => {
  const requests: URLSearchParams[] = [];
  let next: StubResponse = { status: 500, body: { error: 'not_configured' } };
  const server: Server = createServer((request, response) => {
    void readBody(request).then((body) => {
      requests.push(new URLSearchParams(body));
      response.writeHead(next.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(next.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/token`,
    requests,
    respondWith: (response) => {
      next = response;
    },
    close: () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  };
};

export const fakeIdToken = (claims: Record<string, unknown>): string =>
  ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
