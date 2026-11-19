import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  withImap,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { seedImapAccount } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const seenInInbox = (mailbox: GreenMailAccount): Promise<number> =>
  withImap(mailbox, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const seen = await client.search({ seen: true }, { uid: true });
      return seen === false ? 0 : seen.length;
    } finally {
      lock.release();
    }
  });

describe('local mode mark folder read (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await deliverMail(mailbox, {
      from: 'Jana <jana@example.com>',
      subject: 'Porada',
      text: 'O 10.',
    });
    await deliverMail(mailbox, {
      from: 'Peter <peter@example.com>',
      subject: 'Obed',
      text: 'Ide?',
    });
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('marks every unread inbox thread read locally and on IMAP', async () => {
    const { bridge, runtime } = harness;
    const account = await seedImapAccount(runtime, mailbox);
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const before = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(before.items.map((thread) => thread.unread)).toEqual([true, true]);
    const eventsBefore = harness.events.length;

    const result = expectOk(await bridge.invoke('local.threads.markFolderRead', { view: 'inbox' }));

    expect(result).toEqual({ count: 2 });
    const after = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(after.items.map((thread) => thread.unread)).toEqual([false, false]);
    expect(await seenInInbox(mailbox)).toBe(2);
    const upserted = harness.events
      .slice(eventsBefore)
      .flatMap((event) => (event.type === 'thread.upserted' ? [event.data.thread] : []));
    expect(upserted.map((thread) => thread.unread)).toEqual([false, false]);
  });

  it('rejects a label folder without a label id', async () => {
    const result = await harness.bridge.invoke('local.threads.markFolderRead', { view: 'label' });

    expect(result).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
  });
});
