import { AutomationActivityIdSchema, AutomationIdSchema } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import type { MailClient } from '../src/data/MailClient';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';

const AUTOMATION = AutomationIdSchema.parse('automation-1');
const ENTRY = AutomationActivityIdSchema.parse('activity-1');

describe('RemoteMailClient rule history', () => {
  let server: ContractServer;
  let client: MailClient | null = null;

  beforeEach(async () => {
    server = await startContractServer();
  });

  afterEach(async () => {
    client?.dispose();
    client = null;
    await server.close();
  });

  const connect = async () => {
    const store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
      reconnectDelayMs: 20,
    });
    return client;
  };

  const missingRoute = (message: string) => () => ({
    status: 404,
    body: { error: { code: 'not_found', message } },
  });

  it('asks for a server update when the history endpoints are missing', async () => {
    server.handle('automationHistory.history', missingRoute('Cannot GET /automations/x/history'));
    server.handle('automationHistory.undoSince', missingRoute('Cannot POST /automations/x'));
    const remote = await connect();
    const outdated = {
      code: 'not_implemented',
      message: 'Server je starší a nepodporuje históriu pravidla. Aktualizuj server.',
    };

    await expect(remote.automationHistory(AUTOMATION)).rejects.toMatchObject(outdated);
    await expect(
      remote.undoAutomationSince(AUTOMATION, '2026-11-19T00:00:00.000Z'),
    ).rejects.toMatchObject(outdated);
  });

  it('keeps a real not found error of a run', async () => {
    server.handle('automationHistory.undoEntry', missingRoute('Automation activity not found'));
    const remote = await connect();

    await expect(remote.undoAutomationActivity(AUTOMATION, ENTRY)).rejects.toMatchObject({
      code: 'not_found',
      message: 'Automation activity not found',
    });
    expect(server.requests.at(-1)?.key).toBe('automationHistory.undoEntry');
  });
});
