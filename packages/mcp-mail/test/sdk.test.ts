import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('MCP SDK wiring', () => {
  const closers: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  it('exposes a zod-validated tool to an in-memory client', async () => {
    const server = new McpServer({ name: 'relay-mail-test', version: '0.0.0' });
    server.registerTool(
      'count_unread',
      {
        description: 'Counts unread threads',
        inputSchema: { accountId: z.string().min(1) },
      },
      ({ accountId }) => ({ content: [{ type: 'text', text: `${accountId}:3` }] }),
    );
    const client = new Client({ name: 'relay-test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    closers.push(
      () => client.close(),
      () => server.close(),
    );

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['count_unread']);

    const result = await client.callTool({
      name: 'count_unread',
      arguments: { accountId: 'acc_1' },
    });
    expect(result.content).toEqual([{ type: 'text', text: 'acc_1:3' }]);

    const invalid = await client.callTool({ name: 'count_unread', arguments: { accountId: '' } });
    expect(invalid.isError).toBe(true);
  });
});
