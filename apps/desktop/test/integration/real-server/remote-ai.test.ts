import '../support/node-abort-globals';
import { CliDetector, CliLocator, createCliRunnerRegistry } from '@relay/ai';
import type { AiEvent, ThreadSummary } from '@relay/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRemoteAiSupervisor } from '../../../src/main/ai/remote/create-remote-ai-supervisor';
import type { RemoteAiSupervisor } from '../../../src/main/ai/remote/remote-ai-supervisor';
import { systemClock } from '../../../src/main/infra/system-clock';
import { systemTimers } from '../../../src/main/platform/timers';
import type { MailClient } from '../../../src/renderer/src/data/MailClient';
import { createGreenMailAccount, type GreenMailAccount } from '../../main/support/greenmail';
import { createTestLogger } from '../../main/support/memory-log-sink';
import { installStubClaude, type StubClaude } from '../../main/support/stub-claude';
import { createMailbox, imapAccount, sendMail } from './support/mail-fixtures';
import { type RelayServer, SERVER_HOOK_TIMEOUT_MS, startRelayServer } from './support/relay-server';
import { startSyncedDesktop, type SyncedDesktop, uniqueEmail } from './support/synced-desktop';

const SUMMARY = 'Jana posiela faktúru za október.';

describe('remote AI worker of the desktop against the real server', { timeout: 60_000 }, () => {
  let server: RelayServer | null = null;
  let desktop: SyncedDesktop | null = null;
  let owner: GreenMailAccount | null = null;
  let partner: GreenMailAccount | null = null;
  let claude: StubClaude | null = null;
  let supervisor: RemoteAiSupervisor | null = null;

  beforeAll(async () => {
    server = await startRelayServer();
  }, SERVER_HOOK_TIMEOUT_MS);

  beforeEach(async () => {
    desktop = await startSyncedDesktop(server?.url ?? '');
    owner = await createMailbox();
    partner = await createGreenMailAccount();
    claude = await installStubClaude();
  });

  afterEach(async () => {
    await supervisor?.stop();
    supervisor = null;
    await desktop?.close();
    await owner?.remove();
    await partner?.remove();
    await claude?.dispose();
  });

  afterAll(async () => {
    await server?.close();
  }, SERVER_HOOK_TIMEOUT_MS);

  const startWorker = async (app: SyncedDesktop, stub: StubClaude): Promise<RemoteAiSupervisor> => {
    supervisor = createRemoteAiSupervisor({
      deviceSettings: app.deviceSettings,
      sessions: app.sessions,
      registry: createCliRunnerRegistry({
        location: 'local',
        detector: new CliDetector({
          locator: new CliLocator({ pathEnv: stub.dir, extraDirs: [] }),
        }),
      }),
      clock: systemClock,
      timers: systemTimers,
      logger: createTestLogger().logger,
      options: { intervals: { localMs: 60_000, serverMs: 60_000 }, heartbeatMs: 1_000 },
    });
    await supervisor.start();
    return supervisor;
  };

  const syncedThread = async (client: MailClient): Promise<ThreadSummary> => {
    let threads: ThreadSummary[] = [];
    await expect
      .poll(
        async () => {
          threads = (await client.listThreads({ view: 'inbox' })).items;
          return threads.length;
        },
        { timeout: 20_000 },
      )
      .toBe(1);
    return threads[0] as ThreadSummary;
  };

  it('claims a queued job on the realtime wakeup and completes it with the local CLI', async () => {
    expect(desktop && owner && partner && claude).toBeTruthy();
    const app = desktop as SyncedDesktop;
    const stub = claude as StubClaude;
    await app.register(uniqueEmail('ai'));
    const client = app.openClient();
    await client.updateSettings({ ai: { location: 'local' } });
    const worker = await startWorker(app, stub);
    await expect.poll(() => worker.status.state, { timeout: 10_000 }).toBe('idle');
    await sendMail(
      partner as GreenMailAccount,
      owner as GreenMailAccount,
      'Faktúra za október',
      'Ahoj, posielam faktúru za október.',
    );
    await client.createAccount(imapAccount(owner as GreenMailAccount));
    const thread = await syncedThread(client);
    await expect
      .poll(async () => (await client.listThreads({ view: 'inbox' })).items[0]?.aiOneLiner, {
        timeout: 20_000,
      })
      .toBe(SUMMARY);

    const events: AiEvent[] = [];
    client.runAi({ input: { kind: 'summary', threadId: thread.id } }, (event) => {
      events.push(event);
    });

    await expect.poll(() => events.at(-1)?.type, { timeout: 20_000 }).toBe('completed');
    expect(events[0]).toEqual({ type: 'started', runner: 'claude' });
    expect(events.at(-1)).toMatchObject({
      type: 'completed',
      output: { kind: 'summary', summary: SUMMARY },
    });
    const detail = await client.getThread(thread.id);
    expect(detail.aiSummary).toBe(SUMMARY);
    const calls = await stub.calls();
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.stdin.includes('posielam faktúru za október'))).toBe(true);
    expect(calls[1]?.mcpConfig).toContain(`${app.serverUrl}/mcp`);
    expect(calls[1]?.mcpConfig).toMatch(/Bearer \S+/);
    expect(calls.map((call) => call.mcpStatus)).toEqual([200, 200]);
    expect(worker.status).toMatchObject({ state: 'idle', serverUrl: app.serverUrl });
  });
});
