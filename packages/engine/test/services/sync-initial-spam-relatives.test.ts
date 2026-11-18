import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const OLD: MailSpec = { id: 'm1', subject: 'Plan', date: '2026-08-01T08:00:00.000Z' };

const SPAM_REPLY: MailSpec = {
  id: 'r1',
  subject: 'Re: Plan',
  inReplyTo: 'm1',
  references: ['m1'],
  date: '2026-11-14T08:00:00.000Z',
};

const states = (engine: TestEngine) =>
  [...engine.db.tables.threads.values()].map((thread) => [thread.state, thread.messageCount]);

const spamAccount = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  seeded.server.addMailbox('Spam', 'spam');
  return seeded;
};

const resetInboxOnRead = (server: FakeMailServer, nth: number): void => {
  let reads = 0;
  const hook = (path: string): void => {
    reads += path === 'INBOX' ? 1 : 0;
    if (reads === nth) {
      server.resetUidValidity('INBOX');
      return;
    }
    server.beforeNextFetch = hook;
  };
  server.beforeNextFetch = hook;
};

const spamWindow = async (engine: TestEngine, accountId: AccountId) => {
  const spam = present(await engine.repositories.mailboxes.findByRole(accountId, 'spam'));
  return (await engine.repositories.syncStates.find(spam.id))?.initialWindow;
};

describe('SyncService initial sync of spam replies to older mail', () => {
  it('keeps a thread in the inbox when its older message outside the window is in INBOX', async () => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await spamAccount(engine);
    deliverMail(server, 'INBOX', OLD);
    deliverMail(server, 'Spam', SPAM_REPLY);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine)).toEqual([['inbox', 2]]);
  });

  it('keeps the spam window open when INBOX changes during the relative lookup', async () => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await spamAccount(engine);
    deliverMail(server, 'INBOX', OLD);
    deliverMail(server, 'Spam', SPAM_REPLY);
    resetInboxOnRead(server, 2);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine)).not.toContainEqual(['spam', 1]);
    expect(await spamWindow(engine, account.id)).not.toBeNull();

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine)).toEqual([['inbox', 2]]);
    expect(await spamWindow(engine, account.id)).toBeNull();
  });
});
