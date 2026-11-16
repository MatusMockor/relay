import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bearerToken, createMailMcpHttpHandler } from '../src/transports/http';
import { thread, USER_A, USER_B } from './support/fixtures';
import { InMemoryMail } from './support/in-memory-mail';
import { backendFor, firstText } from './support/mcp-client';

const TOKENS: Readonly<Record<string, string>> = { 'token-a': USER_A, 'token-b': USER_B };

describe('streamable HTTP transport', () => {
  let httpServer: Server;
  let url: URL;
  const clients: Client[] = [];

  beforeEach(async () => {
    const mail = new InMemoryMail();
    mail.addThread(USER_A, thread('thr_1', { subject: 'Faktúra A' }));
    mail.addThread(USER_B, thread('thr_2', { subject: 'Faktúra B' }));
    const handler = createMailMcpHttpHandler((request) => {
      const userId = TOKENS[bearerToken(request) ?? ''];
      return Promise.resolve(userId === undefined ? null : backendFor(mail, userId));
    });
    httpServer = createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    url = new URL(`http://127.0.0.1:${String((httpServer.address() as AddressInfo).port)}/mcp`);
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await new Promise<void>((resolve) =>
      httpServer.close(() => {
        resolve();
      }),
    );
  });

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'relay-http-test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    clients.push(client);
    return client;
  }

  it('serves tools scoped to the authenticated user per request', async () => {
    const clientA = await connect('token-a');
    const clientB = await connect('token-b');

    const resultA = await clientA.callTool({
      name: 'search_threads',
      arguments: { query: 'faktúra' },
    });
    const resultB = await clientB.callTool({
      name: 'search_threads',
      arguments: { query: 'faktúra' },
    });

    expect(firstText(resultA.content)).toContain('"threadId":"thr_1"');
    expect(firstText(resultA.content)).not.toContain('thr_2');
    expect(firstText(resultB.content)).toContain('"threadId":"thr_2"');
    expect((await clientA.listTools()).tools).toHaveLength(8);
  });

  it('rejects requests without a valid token', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(response.status).toBe(401);
    await expect(connect('wrong')).rejects.toThrow();
  });
});
