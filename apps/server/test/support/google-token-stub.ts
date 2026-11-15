import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedTokenRequest {
  readonly params: Readonly<Record<string, string>>;
}

export interface GoogleTokenStub {
  readonly url: string;
  readonly requests: RecordedTokenRequest[];
  close(): Promise<void>;
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const idTokenFor = (email: string): string => {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ email, email_verified: true })}.sig`;
};

export const startGoogleTokenStub = async (email: string): Promise<GoogleTokenStub> => {
  const requests: RecordedTokenRequest[] = [];
  const server: Server = createServer((request, response) => {
    void readBody(request).then((body) => {
      const params = Object.fromEntries(new URLSearchParams(body));
      requests.push({ params });
      response.setHeader('content-type', 'application/json');
      if (params.code !== 'good-code') {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      response.end(
        JSON.stringify({
          access_token: 'google-access',
          refresh_token: 'google-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://mail.google.com/ openid email',
          id_token: idTokenFor(email),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/token`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
};
