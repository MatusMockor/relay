import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const day = (date: number): string => `2026-11-${String(date).padStart(2, '0')}T08:00:00.000Z`;

const streamedUids = (server: FakeMailServer): number[] =>
  server.streamedMessages.map((entry) => entry.uid);

const upsertedSubjects = (engine: TestEngine): string[] =>
  engine.events.ofType('thread.upserted').map((event) => event.data.thread.subject);

const findInbox = async (engine: TestEngine, accountId: AccountId) =>
  present(await engine.repositories.mailboxes.findByRole(accountId, 'inbox'));

const inboxState = async (engine: TestEngine, accountId: AccountId) =>
  engine.repositories.syncStates.find((await findInbox(engine, accountId)).id);

describe('SyncService initial sync ordering', () => {
  it('ingests and flushes the newest mail first', async () => {
    const engine = createTestEngine({ sync: { batchSize: 2 } });
    const { account, server } = await seedAccount(engine);
    [1, 2, 3, 4, 5].forEach((date) => {
      deliverMail(server, 'INBOX', { id: `m${String(date)}`, date: day(date) });
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamedUids(server)).toEqual([5, 4, 3, 2, 1]);
    const subjects = upsertedSubjects(engine);
    expect(subjects.slice(0, 2).sort()).toEqual(['Subject m4', 'Subject m5']);
    expect(subjects.slice(2, 4).sort()).toEqual(['Subject m2', 'Subject m3']);
    expect(subjects.slice(4)).toEqual(['Subject m1']);
    expect(await inboxState(engine, account.id)).toMatchObject({
      lastUid: 5,
      initialWindow: null,
    });
  });

  it('keeps a conversation together when it spans fetch chunks', async () => {
    const engine = createTestEngine({ sync: { batchSize: 2 } });
    const { account, server } = await seedAccount(engine);
    const a1 = deliverMail(server, 'INBOX', { id: 'a1', subject: 'Kickoff', date: day(1) });
    const b1 = deliverMail(server, 'INBOX', { id: 'b1', subject: 'Lunch', date: day(2) });
    const a2 = deliverMail(server, 'INBOX', {
      id: 'a2',
      subject: 'Re: Kickoff',
      date: day(3),
      inReplyTo: 'a1',
      references: ['a1'],
    });
    const c1 = deliverMail(server, 'INBOX', { id: 'c1', subject: 'Invoice', date: day(4) });
    const a3 = deliverMail(server, 'INBOX', {
      id: 'a3',
      subject: 'Re: Kickoff',
      date: day(5),
      inReplyTo: 'a2',
      references: ['a1', 'a2'],
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamedUids(server)).toEqual([a1, a2, a3, c1, b1]);
    const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(page.items.map((thread) => [thread.subject, thread.messageCount])).toEqual([
      ['Kickoff', 3],
      ['Invoice', 1],
      ['Lunch', 1],
    ]);
    expect(upsertedSubjects(engine)[0]).toBe('Kickoff');
  });

  it('threads an inbox reply with the sent original it answers', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Sent', {
      id: 's1',
      subject: 'Ponuka',
      from: ME,
      to: [{ name: null, email: 'peter@partner.test' }],
      date: day(13),
      seen: true,
    });
    deliverMail(server, 'INBOX', {
      id: 'r1',
      subject: 'Re: Ponuka',
      date: day(14),
      inReplyTo: 's1',
      references: ['s1'],
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(engine.db.tables.threads.size).toBe(1);
    const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(page.items.map((thread) => [thread.subject, thread.messageCount])).toEqual([
      ['Ponuka', 2],
    ]);
  });

  it('resumes an interrupted initial sync with the older mail it did not fetch', async () => {
    const engine = createTestEngine({ sync: { batchSize: 2 } });
    const { account, server } = await seedAccount(engine);
    [1, 2, 3, 4, 5].forEach((date) => {
      deliverMail(server, 'INBOX', { id: `m${String(date)}`, date: day(date) });
    });
    server.interruptStreamAfter = 3;

    const interrupted = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(interrupted.ok).toBe(false);
    expect([...engine.db.tables.messages.values()].map((message) => message.uid).sort()).toEqual([
      4, 5,
    ]);
    expect(await inboxState(engine, account.id)).toMatchObject({
      initialWindow: { floorUid: 1, cutoff: '2026-10-16T10:00:00.000Z' },
    });
    server.streamedMessages.length = 0;
    engine.events.clear();

    const resumed = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(resumed.ok).toBe(true);
    expect(streamedUids(server)).toEqual([3, 2, 1]);
    const uids = [...engine.db.tables.messages.values()].map((message) => message.uid);
    expect(uids.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(engine.db.tables.threads.size).toBe(5);
    expect(engine.events.ofType('message.upserted')).toHaveLength(0);
    const inbox = await findInbox(engine, account.id);
    const progress = engine.events
      .ofType('sync.progress')
      .filter((event) => event.data.mailboxId === inbox.id)
      .map((event) => [event.data.processed, event.data.total]);
    expect(progress).toEqual([
      [4, 5],
      [5, 5],
      [5, 5],
    ]);
    expect(await inboxState(engine, account.id)).toMatchObject({
      lastUid: 5,
      initialWindow: null,
    });
  });

  it('keeps the incremental sync ascending and published', async () => {
    const engine = createTestEngine({ sync: { batchSize: 2 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', date: day(10) });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    [11, 12, 13].forEach((date) => {
      deliverMail(server, 'INBOX', { id: `n${String(date)}`, date: day(date) });
    });
    server.streamedMessages.length = 0;
    engine.events.clear();

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamedUids(server)).toEqual([2, 3, 4]);
    expect(engine.events.ofType('message.upserted')).toHaveLength(3);
    const inbox = await findInbox(engine, account.id);
    const progress = engine.events
      .ofType('sync.progress')
      .filter((event) => event.data.mailboxId === inbox.id)
      .map((event) => [event.data.processed, event.data.total]);
    expect(progress).toEqual([
      [2, 3],
      [3, 3],
    ]);
    expect(await inboxState(engine, account.id)).toMatchObject({
      lastUid: 4,
      initialWindow: null,
    });
  });
});
