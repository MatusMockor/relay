import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { UserIdSchema } from '@relay/shared/domain';
import { expect } from 'vitest';
import type { MailToolBackend } from '../../src/backend/mail-tool-backend';
import { scopeMailTools } from '../../src/backend/mail-tool-services';
import { createMailMcpServer } from '../../src/server';
import type { InMemoryMail } from './in-memory-mail';

export interface ConnectedClient {
  readonly client: Client;
  close(): Promise<void>;
}

export function backendFor(mail: InMemoryMail, userId: string): MailToolBackend {
  return scopeMailTools(mail, mail, UserIdSchema.parse(userId));
}

export async function connectInMemory(backend: MailToolBackend): Promise<ConnectedClient> {
  const server = createMailMcpServer(backend);
  const client = new Client({ name: 'relay-test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export async function callJson(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError ?? false).toBe(false);
  return JSON.parse(firstText(result.content)) as unknown;
}

export function firstText(content: unknown): string {
  const items = Array.isArray(content) ? (content as unknown[]) : [];
  const first: unknown = items[0];
  if (
    typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
  ) {
    return first.text;
  }
  return '';
}
