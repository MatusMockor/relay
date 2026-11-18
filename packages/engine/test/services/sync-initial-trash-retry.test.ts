import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

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

const states = (engine: TestEngine) =>
  [...engine.db.tables.threads.values()].map((thread) => [thread.state, thread.messageCount]);

const trashWindow = async (engine: TestEngine, accountId: AccountId) => {
  const trash = present(await engine.repositories.mailboxes.findByRole(accountId, 'trash'));
  return (await engine.repositories.syncStates.find(trash.id))?.initialWindow;
};

describe('SyncService initial sync retries trash relatives it could not read', () => {
  it.each([
    ['the relative lookup', 2],
    ['the relative fetch', 3],
  ])('keeps the trash window open when INBOX changes during %s', async (_label, nth) => {
    const engine = createTestEngine({ sync: { initialWindowDays: 30 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', date: '2026-08-01T08:00:00.000Z' });
    deliverMail(server, 'Trash', {
      id: 'r1',
      inReplyTo: 'm1',
      references: ['m1'],
      date: '2026-11-14T08:00:00.000Z',
    });
    resetInboxOnRead(server, nth);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine)).not.toContainEqual(['trash', 1]);
    expect(await trashWindow(engine, account.id)).not.toBeNull();

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(states(engine)).toEqual([['inbox', 2]]);
    expect(await trashWindow(engine, account.id)).toBeNull();
  });
});
