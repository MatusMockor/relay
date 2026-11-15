import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { localOrigin } from '../../src/ai/mcp/local-server-url';

const listen = (host: string): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = createServer((_request, response) => {
      response.end('relay');
    });
    server.once('error', reject);
    server.listen(0, host, () => {
      resolve(server);
    });
  });

describe('localOrigin', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          }),
      ),
    );
  });

  it('maps wildcard binds to loopback and keeps specific addresses', () => {
    const at = (address: string, family: string): AddressInfo => ({ address, family, port: 4100 });
    expect(localOrigin(at('0.0.0.0', 'IPv4'))).toBe('http://127.0.0.1:4100');
    expect(localOrigin(at('::', 'IPv6'))).toBe('http://[::1]:4100');
    expect(localOrigin(at('::1', 'IPv6'))).toBe('http://[::1]:4100');
    expect(localOrigin(at('127.0.0.2', 'IPv4'))).toBe('http://127.0.0.2:4100');
    expect(localOrigin(at('fe80::1', 'IPv6'))).toBe('http://[fe80::1]:4100');
  });

  it('reaches a server bound to a specific loopback address', async () => {
    const server = await listen('127.0.0.2');
    servers.push(server);
    const response = await fetch(localOrigin(server.address() as AddressInfo));
    expect(await response.text()).toBe('relay');
  });
});
