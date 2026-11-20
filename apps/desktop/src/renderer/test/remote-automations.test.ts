import { AutomationIdSchema } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import type { MailClient } from '../src/data/MailClient';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';

describe('RemoteMailClient automations on an older server', () => {
  let server: ContractServer;
  let store: MemoryTokenStore;
  let client: MailClient | null = null;

  beforeEach(async () => {
    server = await startContractServer();
    store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
  });

  afterEach(async () => {
    client?.dispose();
    client = null;
    await server.close();
  });

  const connect = () => {
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
      reconnectDelayMs: 20,
    });
    return client;
  };

  const ai = { runner: 'claude', model: null, effort: null, instructions: null } as const;
  const rule = {
    id: AutomationIdSchema.parse('automation-1'),
    accountId: null,
    name: 'Dodávatelia',
    enabled: true,
    order: 0,
    match: 'any' as const,
    conditions: [{ type: 'fromDomain' as const, domain: 'dodavatel.sk' }],
    exceptions: [{ type: 'fromAddress' as const, address: 'noreply@firma.sk' }],
    ai,
    actions: [{ type: 'archive' as const }],
  };
  const legacyResponse = [
    {
      id: 'automation-1',
      userId: 'user-1',
      accountId: null,
      name: 'Dodávatelia',
      enabled: true,
      order: 0,
      preset: null,
      conditions: [{ type: 'fromDomain', domain: 'dodavatel.sk' }],
      ai,
      actions: [{ type: 'archive' }],
    },
  ];

  it('refuses to report success when the server dropped the match mode and exceptions', async () => {
    server.handle('automations.replace', () => ({ body: legacyResponse }));

    await expect(connect().replaceAutomations([rule])).rejects.toMatchObject({
      code: 'not_implemented',
      message: 'Server je starší a nepodporuje režim podmienok ani výnimky. Aktualizuj server.',
    });
  });

  it('accepts an older server response for a rule without the new fields', async () => {
    server.handle('automations.replace', () => ({ body: legacyResponse }));

    const saved = await connect().replaceAutomations([{ ...rule, match: 'all', exceptions: [] }]);

    expect(saved[0]).toMatchObject({ match: 'all', exceptions: [] });
  });

  it('accepts a current server that kept the new fields', async () => {
    server.handle('automations.replace', () => ({
      body: legacyResponse.map((item) => ({
        ...item,
        match: 'any',
        exceptions: rule.exceptions,
      })),
    }));

    expect((await connect().replaceAutomations([rule]))[0]?.match).toBe('any');
  });

  it('asks for a server update when the preview endpoint is missing', async () => {
    server.handle('automations.preview', () => ({
      status: 404,
      body: { error: { code: 'not_found', message: 'Cannot POST /automations/preview' } },
    }));

    await expect(
      connect().previewAutomation({
        accountId: null,
        match: 'all',
        conditions: rule.conditions,
        exceptions: [],
      }),
    ).rejects.toMatchObject({
      code: 'not_implemented',
      message: 'Server je starší a nepodporuje náhľad pravidla. Aktualizuj server.',
    });
  });
});
