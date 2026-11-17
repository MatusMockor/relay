import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DAY_MS = 86_400_000;
const day = (date: number): string => `2026-11-${String(date).padStart(2, '0')}T08:00:00.000Z`;

const streamedUids = (server: FakeMailServer): number[] =>
  server.streamedMessages.map((entry) => entry.uid);

const inboxState = async (engine: TestEngine, accountId: AccountId) => {
  const inbox = present(await engine.repositories.mailboxes.findByRole(accountId, 'inbox'));
  return engine.repositories.syncStates.find(inbox.id);
};

const inboxThreads = async (engine: TestEngine) => {
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return page.items.map((thread) => [thread.subject, thread.messageCount]);
};

const storedUids = (engine: TestEngine): number[] =>
  [...engine.db.tables.messages.values()].map((message) => message.uid).sort((a, b) => a - b);

describe('SyncService initial sync regressions', () => {
  it('resumes the window frozen by the first attempt, including mail that arrived since', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1, initialMessageLimit: 3 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', date: '2026-10-20T08:00:00.000Z' });
    deliverMail(server, 'INBOX', { id: 'm2', date: day(1) });
    deliverMail(server, 'INBOX', { id: 'm3', date: day(2) });
    server.interruptStreamAfter = 1;

    const interrupted = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(interrupted.ok).toBe(false);
    expect(storedUids(engine)).toEqual([3]);
    expect(await inboxState(engine, account.id)).toMatchObject({
      initialWindow: { floorUid: 1, cutoff: '2026-10-16T10:00:00.000Z' },
    });
    deliverMail(server, 'INBOX', { id: 'm4', date: day(14) });
    engine.clock.advance(10 * DAY_MS);
    server.streamedMessages.length = 0;

    const resumed = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(resumed.ok).toBe(true);
    expect(streamedUids(server)).toEqual([4, 2, 1]);
    expect(storedUids(engine)).toEqual([1, 2, 3, 4]);
    expect(await inboxState(engine, account.id)).toMatchObject({ lastUid: 4, initialWindow: null });
    server.streamedMessages.length = 0;
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(streamedUids(server)).toEqual([]);
    expect(storedUids(engine)).toEqual([1, 2, 3, 4]);
  });

  it('keeps a reply without threading headers in the thread of its original', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1 } });
    const { account, server } = await seedAccount(engine);
    const original = deliverMail(server, 'INBOX', { id: 't1', subject: 'Topic', date: day(1) });
    const other = deliverMail(server, 'INBOX', { id: 'l1', subject: 'Lunch', date: day(2) });
    const reply = deliverMail(server, 'INBOX', { id: 't2', subject: 'Re: Topic', date: day(3) });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamedUids(server)).toEqual([original, reply, other]);
    expect(await inboxThreads(engine)).toEqual([
      ['Topic', 2],
      ['Lunch', 1],
    ]);
  });

  it('ingests an original before its reply even when the original arrived later', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1 } });
    const { account, server } = await seedAccount(engine);
    const original = deliverMail(server, 'INBOX', {
      id: 'a1',
      subject: 'Kickoff',
      date: day(1),
      internalDate: day(5),
    });
    const reply = deliverMail(server, 'INBOX', {
      id: 'a2',
      subject: 'Re: Kickoff',
      date: day(2),
      internalDate: day(3),
      inReplyTo: 'a1',
      references: ['a1'],
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamedUids(server)).toEqual([original, reply]);
    expect(await inboxThreads(engine)).toEqual([['Kickoff', 2]]);
  });
});
