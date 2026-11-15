import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IdleSupervisor } from '../../src/main/background/idle-supervisor';
import { type GatedTcpProxy, startGatedTcpProxy } from './support/gated-tcp-proxy';
import { createGreenMailAccount, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';
import { seedImapAccount } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

describe('IMAP IDLE supervisor against GreenMail', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let proxy: GatedTcpProxy;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    proxy = await startGatedTcpProxy(mailbox.host, mailbox.imapPort);
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await proxy.close();
    await mailbox.remove();
    await dir.remove();
  });

  const realSupervisor = () => {
    const { runtime } = harness;
    const log = createTestLogger();
    const supervisor = new IdleSupervisor({
      watcher: {
        watch: (accountId) => runtime.engine.services.sync.watchAccount(LOCAL_USER_ID, accountId),
      },
      timers: new ManualTime(),
      logger: log.logger,
    });
    return { supervisor, messages: () => log.sink.messages() };
  };

  it('holds one IDLE connection while watching and closes it on release', async () => {
    const account = await seedImapAccount(harness.runtime, mailbox, proxy.port);
    const { supervisor, messages } = realSupervisor();
    proxy.release();

    await supervisor.reconcile([account.id]);

    expect(supervisor.watching()).toEqual([account.id]);
    expect(proxy.openConnections()).toBeGreaterThan(0);
    await supervisor.reconcile([]);
    expect(supervisor.watching()).toEqual([]);
    await expect.poll(() => proxy.openConnections(), { timeout: 5_000 }).toBe(0);
    expect(messages()).toEqual([]);
  });

  it('closes an IDLE connection that finishes connecting after the account was released', async () => {
    const account = await seedImapAccount(harness.runtime, mailbox, proxy.port);
    const { supervisor, messages } = realSupervisor();

    const watching = supervisor.reconcile([account.id]);
    await proxy.waitForClient();
    const releasing = supervisor.reconcile([]);
    proxy.release();
    await Promise.all([watching, releasing]);

    expect(supervisor.watching()).toEqual([]);
    await expect.poll(() => proxy.openConnections(), { timeout: 5_000 }).toBe(0);
    expect(messages()).toEqual([]);
  });
});
