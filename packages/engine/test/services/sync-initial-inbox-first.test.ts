import { describe, expect, it } from 'vitest';
import { deliverMail, ME, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const day = (date: number): string => `2026-11-${String(date).padStart(2, '0')}T08:00:00.000Z`;

const streamed = (server: FakeMailServer): string[] =>
  server.streamedMessages.map(({ path, uid }) => `${path}:${String(uid)}`);

const upsertedSubjects = (engine: TestEngine): string[] =>
  engine.events.ofType('thread.upserted').map((event) => event.data.thread.subject);

const onFirstFetchOf = (server: FakeMailServer, target: string, run: () => void): void => {
  server.beforeNextFetch = (path) => {
    if (path !== target) {
      onFirstFetchOf(server, target, run);
      return;
    }
    run();
  };
};

const upsertedCounts = (engine: TestEngine): (string | number)[][] =>
  engine.events
    .ofType('thread.upserted')
    .map(({ data }) => [data.thread.subject, data.thread.messageCount]);

const inboxThreads = async (engine: TestEngine) =>
  (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items.map((thread) => [
    thread.subject,
    thread.messageCount,
  ]);

const states = (engine: TestEngine) =>
  [...engine.db.tables.syncStates.values()].map((state) => state.initialWindow);

describe('SyncService initial sync inbox first', () => {
  it('flushes the newest inbox mail before reading the other mailboxes', async () => {
    const engine = createTestEngine({
      sync: { batchSize: 3, firstBatchSize: 2, firstPageConversations: 0 },
    });
    const { account, server } = await seedAccount(engine);
    [1, 2, 3, 4, 5].forEach((date) => {
      deliverMail(server, 'INBOX', { id: `i${String(date)}`, date: day(date) });
    });
    [6, 7, 8].forEach((date) => {
      deliverMail(server, 'Archive', { id: `a${String(date)}`, date: day(date) });
    });
    deliverMail(server, 'Sent', { id: 's9', from: ME, date: day(9), seen: true });
    let beforeOthers: string[] = [];
    onFirstFetchOf(server, 'Sent', () => {
      beforeOthers = upsertedSubjects(engine);
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(beforeOthers.sort()).toEqual(['Subject i4', 'Subject i5']);
    expect(server.uidListings.slice(0, 2)).toEqual(['INBOX', 'Sent']);
    expect(streamed(server)).toEqual([
      'INBOX:5',
      'INBOX:4',
      'INBOX:3',
      'INBOX:2',
      'INBOX:1',
      'Sent:1',
      'Archive:3',
      'Archive:2',
      'Archive:1',
    ]);
    expect(engine.db.tables.threads.size).toBe(9);
    expect(states(engine)).toEqual([null, null, null, null]);
  });

  it('fills the first inbox page in a second flush before reading the other mailboxes', async () => {
    const engine = createTestEngine({
      sync: { batchSize: 5, firstBatchSize: 2, firstPageConversations: 4 },
    });
    const { account, server } = await seedAccount(engine);
    [1, 2, 3, 4, 5, 6].forEach((date) => {
      deliverMail(server, 'INBOX', { id: `i${String(date)}`, date: day(date) });
    });
    deliverMail(server, 'Archive', { id: 'a7', date: day(7) });
    const seen: string[][] = [];
    const record = (path: string): void => {
      seen.push([path, ...upsertedSubjects(engine).sort()]);
      server.beforeNextFetch = record;
    };
    server.beforeNextFetch = record;

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(seen.slice(0, 4)).toEqual([
      ['INBOX'],
      ['INBOX'],
      ['INBOX', 'Subject i5', 'Subject i6'],
      ['Sent', 'Subject i3', 'Subject i4', 'Subject i5', 'Subject i6'],
    ]);
    expect(streamed(server).slice(0, 4)).toEqual(['INBOX:6', 'INBOX:5', 'INBOX:4', 'INBOX:3']);
    expect(engine.db.tables.threads.size).toBe(7);
  });

  it('pulls the sent original of a new inbox reply into the first batch', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Sent', { id: 's1', subject: 'Ponuka', from: ME, date: day(12) });
    deliverMail(server, 'INBOX', {
      id: 'r1',
      subject: 'Re: Ponuka',
      date: day(14),
      inReplyTo: 's1',
      references: ['s1'],
    });
    deliverMail(server, 'Archive', { id: 'a1', date: day(13) });
    let beforeArchive: (string | number)[][] = [];
    onFirstFetchOf(server, 'Archive', () => {
      beforeArchive = upsertedCounts(engine);
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(beforeArchive).toEqual([['Ponuka', 2]]);
    expect(streamed(server)).toEqual(['Sent:1', 'INBOX:1', 'Archive:1']);
    expect(await inboxThreads(engine)).toEqual([['Ponuka', 2]]);
    expect(engine.db.tables.threads.size).toBe(2);
  });

  it('waits for the other mailboxes when the parent search fails', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Sent', { id: 's1', subject: 'Ponuka', from: ME, date: day(12) });
    deliverMail(server, 'INBOX', {
      id: 'r1',
      subject: 'Re: Ponuka',
      date: day(14),
      inReplyTo: 's1',
      references: ['s1'],
    });
    server.failSearchIn = 'Sent';

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server)).toEqual(['Sent:1', 'INBOX:1']);
    expect(await inboxThreads(engine)).toEqual([['Ponuka', 2]]);
  });

  it('keeps a reply without reply headers out of the first batch', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Sent', { id: 's1', subject: 'Ponuka', from: ME, date: day(12) });
    deliverMail(server, 'INBOX', { id: 'r1', subject: 'Re: Ponuka', date: day(14) });
    deliverMail(server, 'INBOX', { id: 'n1', subject: 'Novinky', date: day(13) });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server)).toEqual(['INBOX:2', 'Sent:1', 'INBOX:1']);
    expect(await inboxThreads(engine)).toEqual([
      ['Ponuka', 2],
      ['Novinky', 1],
    ]);
  });

  it('leaves an original older than the initial window out of the first batch', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Sent', {
      id: 's1',
      subject: 'Ponuka',
      from: ME,
      date: '2026-09-01T08:00:00.000Z',
    });
    deliverMail(server, 'INBOX', {
      id: 'r1',
      subject: 'Re: Ponuka',
      date: day(14),
      inReplyTo: 's1',
      references: ['s1'],
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server)).toEqual(['INBOX:1']);
    expect(await inboxThreads(engine)).toEqual([['Re: Ponuka', 1]]);
  });

  it('keeps an inbox thread in the inbox when its archive copy arrives later', async () => {
    const engine = createTestEngine({
      sync: { batchSize: 2, firstBatchSize: 1, firstPageConversations: 0 },
    });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'm1', date: day(10) });
    deliverMail(server, 'INBOX', { id: 'm2', date: day(11) });
    deliverMail(server, 'Archive', { id: 'm1', date: day(10) });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server)).toEqual(['INBOX:2', 'INBOX:1', 'Archive:1']);
    expect(await inboxThreads(engine)).toEqual([
      ['Subject m2', 1],
      ['Subject m1', 2],
    ]);
    expect(engine.db.tables.messages.size).toBe(3);
  });

  it('resumes an initial sync interrupted after the first batch', async () => {
    const engine = createTestEngine({
      sync: { batchSize: 2, firstBatchSize: 1, firstPageConversations: 0 },
    });
    const { account, server } = await seedAccount(engine);
    [1, 2, 3].forEach((date) => {
      deliverMail(server, 'INBOX', { id: `i${String(date)}`, date: day(date) });
    });
    deliverMail(server, 'Archive', { id: 'a4', date: day(4) });
    server.interruptStreamAfter = 2;

    const interrupted = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(interrupted.ok).toBe(false);
    expect(streamed(server)).toEqual(['INBOX:3', 'INBOX:2']);
    expect(upsertedSubjects(engine)).toEqual(['Subject i3']);
    expect(states(engine).every((state) => state !== null)).toBe(true);
    server.streamedMessages.length = 0;

    const resumed = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(resumed.ok).toBe(true);
    expect(streamed(server)).toEqual(['INBOX:2', 'INBOX:1', 'Archive:1']);
    expect(engine.db.tables.threads.size).toBe(4);
    expect(states(engine)).toEqual([null, null, null, null]);
    expect(engine.events.ofType('message.upserted')).toHaveLength(0);
  });
});
