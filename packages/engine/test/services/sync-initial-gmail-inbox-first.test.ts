import { describe, expect, it } from 'vitest';
import { deliverMail, ME } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const day = (date: number): string => `2026-11-${String(date).padStart(2, '0')}T12:00:00.000Z`;

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

describe('initial Gmail sync inbox first', () => {
  it('flushes the newest inbox mail first, fills the first page and attaches the All Mail copies later', async () => {
    const engine = createTestEngine({ sync: { batchSize: 3, firstBatchSize: 2 } });
    const { account, server } = await seedGmailAccount(engine);
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

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(beforeOthers.slice(0, 2).sort()).toEqual(['Subject i4', 'Subject i5']);
    expect(beforeOthers.slice(2)).toEqual(['Subject i3']);
    expect(server.uidListings.slice(0, 2)).toEqual(['INBOX', 'Sent']);
    const order = streamed(server);
    expect(order.slice(0, 2)).toEqual(['INBOX:5', 'INBOX:4']);
    expect(order.filter((entry) => entry.startsWith('INBOX'))).toEqual([
      'INBOX:5',
      'INBOX:4',
      'INBOX:3',
      'INBOX:2',
      'INBOX:1',
    ]);
    expect(order.indexOf('Sent:1')).toBeGreaterThan(order.indexOf('INBOX:1'));
    expect(order.filter((entry) => entry.startsWith('Archive')).sort()).toEqual([
      'Archive:6',
      'Archive:7',
      'Archive:8',
    ]);
    expect(report.newMessages).toBe(9);
    expect(engine.db.tables.messages.size).toBe(9);
    expect(engine.db.tables.threads.size).toBe(9);
    const placements = [...engine.db.tables.messages.values()].map(
      (message) => message.placements.length,
    );
    expect(placements.sort()).toEqual([1, 1, 1, 2, 2, 2, 2, 2, 2]);
  });
});
