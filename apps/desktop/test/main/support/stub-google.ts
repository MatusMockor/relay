import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { UrlOpener } from '../../../src/main/platform/url-opener';

export interface StubGoogle {
  readonly tokenEndpoint: string;
  readonly tokenRequests: URLSearchParams[];
  close(): Promise<void>;
}

const idToken = (email: string): string =>
  ['e30', Buffer.from(JSON.stringify({ email })).toString('base64url'), 'sig'].join('.');

export const startStubGoogleTokenEndpoint = async (email: string): Promise<StubGoogle> => {
  const tokenRequests: URLSearchParams[] = [];
  const server: Server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      const params = new URLSearchParams(body);
      tokenRequests.push(params);
      const valid =
        params.get('grant_type') === 'authorization_code' &&
        (params.get('code_verifier') ?? '').length >= 43;
      response.writeHead(valid ? 200 : 400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          valid
            ? {
                access_token: 'access-1',
                refresh_token: 'refresh-1',
                expires_in: 3600,
                token_type: 'Bearer',
                scope: 'https://mail.google.com/ openid email',
                id_token: idToken(email),
              }
            : { error: 'invalid_grant' },
        ),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    tokenEndpoint: `http://127.0.0.1:${String(port)}/token`,
    tokenRequests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};

export type ConsentBehavior = 'approve' | 'deny' | 'tamper-state' | 'ignore';

export class StubBrowser implements UrlOpener {
  readonly opened: URL[] = [];
  readonly callbackStatuses: number[] = [];

  constructor(private readonly behavior: ConsentBehavior = 'approve') {}

  async open(url: string): Promise<void> {
    const authUrl = new URL(url);
    this.opened.push(authUrl);
    if (this.behavior === 'ignore') {
      return;
    }
    const callback = new URL(authUrl.searchParams.get('redirect_uri') ?? '');
    const state = authUrl.searchParams.get('state') ?? '';
    callback.searchParams.set('state', this.behavior === 'tamper-state' ? `${state}x` : state);
    if (this.behavior === 'deny') {
      callback.searchParams.set('error', 'access_denied');
    }
    if (this.behavior !== 'deny') {
      callback.searchParams.set('code', 'auth-code-1');
    }
    const response = await fetch(callback);
    this.callbackStatuses.push(response.status);
  }
}
