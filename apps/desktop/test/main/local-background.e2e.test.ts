import { SocketMailToolBackend } from '@relay/mcp-mail';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModeAwareBackground } from '../../src/main/background/mode-aware-background';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { createTestLogger } from './support/memory-log-sink';
import { seedImapAccount } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const upsertedSubjects = (harness: LocalRuntimeHarness): string[] =>
  harness.events.flatMap((event) =>
    event.type === 'thread.upserted' ? [event.data.thread.subject] : [],
  );

describe('local background work (scheduler + IMAP IDLE + mail tools socket)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;
  let background: ModeAwareBackground;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await deliverMail(mailbox, {
      from: 'Eva <eva@example.com>',
      subject: 'Prvá správa',
      text: 'Ahoj',
    });
    harness = startLocalRuntime(dir, { withMailTools: true });
    await harness.runtime.start();
    background = new ModeAwareBackground(
      harness.runtime.infrastructure.deviceSettings,
      harness.runtime.background,
      createTestLogger().logger,
    );
    await background.start();
  });

  afterEach(async () => {
    await background.stop();
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('starts syncing when the device switches to local mode and picks up new mail via IDLE', async () => {
    const { bridge, runtime } = harness;
    await seedImapAccount(runtime, mailbox);
    expect(runtime.background.lifecycle.isRunning).toBe(false);

    await bridge.invoke('settings.device.set', { mode: 'local' });
    await expect
      .poll(() => upsertedSubjects(harness), { timeout: 10_000 })
      .toContain('Prvá správa');
    expect(runtime.background.lifecycle.isRunning).toBe(true);
    await expect
      .poll(
        () =>
          harness.events.some(
            (event) => event.type === 'account.status' && event.data.status === 'connected',
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    await deliverMail(mailbox, {
      from: 'Peter <peter@example.com>',
      subject: 'Nová správa cez IDLE',
      text: 'Prišla počas behu',
    });
    await expect
      .poll(() => upsertedSubjects(harness), { timeout: 15_000, interval: 200 })
      .toContain('Nová správa cez IDLE');

    await bridge.invoke('settings.device.set', { mode: 'synced' });
    await expect.poll(() => runtime.background.lifecycle.isRunning).toBe(false);
  });

  it('serves the local mail data to the MCP entry over the token-protected socket', async () => {
    const { bridge, runtime } = harness;
    const account = await seedImapAccount(runtime, mailbox);
    expect(await bridge.invoke('local.sync.now', { accountId: account.id })).toEqual({
      ok: true,
      data: { ok: true },
    });
    const endpoint = runtime.mailToolsEndpoint;
    expect(endpoint?.command).toBe(process.execPath);
    expect(endpoint?.env.RELAY_TEST).toBe('1');
    const socketIndex = endpoint?.args.indexOf('--socket') ?? -1;
    const socketPath = endpoint?.args[socketIndex + 1] ?? '';
    const token = endpoint?.env.RELAY_MAIL_MCP_TOKEN ?? '';

    const client = await SocketMailToolBackend.connect(socketPath, token);
    const page = await client.listFolder({
      view: 'inbox',
      accountId: null,
      splitId: null,
      labelId: null,
      search: null,
      cursor: null,
      limit: 10,
    });
    client.close();
    expect(page.items.map((thread) => thread.subject)).toEqual(['Prvá správa']);
    await expect(SocketMailToolBackend.connect(socketPath, 'wrong-token')).rejects.toThrow();
  });
});
