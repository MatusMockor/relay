import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  subjectsIn,
  withImap,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const OFFER = 'Vyhrali ste iPhone';

describe('local mode spam folder (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await deliverMail(mailbox, { from: 'Lotto <win@lotto.test>', subject: OFFER, text: 'Klikni.' });
    await deliverMail(mailbox, {
      from: 'Jana <jana@example.com>',
      subject: 'Porada',
      text: 'O 10.',
    });
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('reports a thread as spam into a created Junk mailbox and brings it back', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const inbox = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    const offer = inbox.items.find((thread) => thread.subject === OFFER);
    expect(offer).toBeDefined();
    if (offer === undefined) {
      return;
    }

    const reported = expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: offer.id,
        action: { type: 'reportSpam' },
      }),
    );
    expect(reported.state).toBe('spam');
    expect(await subjectsIn(mailbox, 'Junk')).toEqual([OFFER]);
    expect(await subjectsIn(mailbox, 'INBOX')).toEqual(['Porada']);
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const spam = expectOk(await bridge.invoke('local.threads.list', { view: 'spam' }));
    expect(spam.items.map((thread) => thread.id)).toEqual([offer.id]);
    const afterReport = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(afterReport.items.map((thread) => thread.subject)).toEqual(['Porada']);

    expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: offer.id,
        action: { type: 'notSpam' },
      }),
    );
    expect(await subjectsIn(mailbox, 'Junk')).toEqual([]);
    expect(await subjectsIn(mailbox, 'INBOX')).toEqual(['Porada', OFFER].sort());
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const back = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(back.items.map((thread) => thread.id)).toContain(offer.id);
    const emptied = expectOk(await bridge.invoke('local.threads.list', { view: 'spam' }));
    expect(emptied.items).toEqual([]);
  });

  it('syncs mail another client moved to the spam mailbox into the spam view', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    await withImap(mailbox, async (client) => {
      await client.mailboxCreate('Spam');
      const lock = await client.getMailboxLock('INBOX');
      try {
        await client.messageMove({ subject: OFFER }, 'Spam');
      } finally {
        lock.release();
      }
    });

    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));

    const spam = expectOk(await bridge.invoke('local.threads.list', { view: 'spam' }));
    expect(spam.items.map((thread) => thread.subject)).toEqual([OFFER]);
    const inbox = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(inbox.items.map((thread) => thread.subject)).toEqual(['Porada']);
  });
});
