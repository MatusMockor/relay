import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { TLSSocket } from 'node:tls';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinnedHttpsTransport } from '../../src';

const tls = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'unsubscribe-tls', name), 'utf8');

interface Received {
  readonly host: string | undefined;
  readonly servername: string | false | null;
  readonly method: string | undefined;
  readonly contentType: string | undefined;
  readonly body: string;
}

describe('pinned https transport', () => {
  let server: Server;
  let port = 0;
  let status = 200;
  let bodySize = 0;
  const received: Received[] = [];

  beforeEach(async () => {
    received.length = 0;
    status = 200;
    bodySize = 0;
    server = createServer({ key: tls('key.pem'), cert: tls('cert.pem') }, (request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push(receivedOf(request, Buffer.concat(chunks).toString('utf8')));
        response.writeHead(status, { location: 'https://127.0.0.1/' }).end('x'.repeat(bodySize));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  const receivedOf = (request: IncomingMessage, body: string): Received => ({
    host: request.headers.host,
    servername: (request.socket as TLSSocket).servername,
    method: request.method,
    contentType: request.headers['content-type'],
    body,
  });

  const waitForNoConnections = async (): Promise<void> => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const open = await new Promise<number>((resolve) => {
        server.getConnections((_error, count) => {
          resolve(count);
        });
      });
      if (open === 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect.fail('the unsubscribe connection stayed open');
  };

  const send = () =>
    createPinnedHttpsTransport({ ca: tls('cert.pem') })({
      url: new URL(`https://unsubscribe.test:${String(port)}/u?id=7`),
      target: { address: '127.0.0.1', family: 4 },
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
      timeoutMs: 2_000,
    });

  it('connects to the pinned address while keeping the Host header and SNI', async () => {
    await expect(send()).resolves.toBe(200);

    expect(received).toEqual([
      {
        host: `unsubscribe.test:${String(port)}`,
        servername: 'unsubscribe.test',
        method: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        body: 'List-Unsubscribe=One-Click',
      },
    ]);
  });

  it('drains an unread response body so the connection is released', async () => {
    status = 500;
    bodySize = 16 * 1024 * 1024;

    await expect(send()).resolves.toBe(500);

    await waitForNoConnections();
  });

  it('reports a redirect status without following it', async () => {
    status = 302;

    await expect(send()).resolves.toBe(302);

    expect(received).toHaveLength(1);
  });
});
