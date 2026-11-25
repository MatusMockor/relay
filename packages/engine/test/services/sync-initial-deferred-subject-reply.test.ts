import { describe, expect, it } from 'vitest';
import { deliverMail, ME, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const day = (date: number): string => `2026-11-${String(date).padStart(2, '0')}T12:00:00.000Z`;

const streamed = (server: FakeMailServer): string[] =>
  server.streamedMessages.map(({ path, uid }) => `${path}:${String(uid)}`);

const inboxThreads = async (engine: TestEngine) =>
  (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items.map((thread) => [
    thread.subject,
    thread.messageCount,
  ]);

describe('initial sync of replies without reply headers and deferred mailboxes', () => {
  it('ingests the original from a custom folder before an inbox reply without reply headers', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    server.addMailbox('Projekty', 'custom');
    deliverMail(server, 'Projekty', { id: 'p1', subject: 'Rozpočet', from: ME, date: day(12) });
    deliverMail(server, 'INBOX', { id: 'n1', subject: 'Novinky', date: day(13) });
    deliverMail(server, 'INBOX', { id: 'r1', subject: 'Re: Rozpočet', date: day(14) });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server)).toEqual(['INBOX:1', 'Projekty:1', 'INBOX:2']);
    expect(await inboxThreads(engine)).toEqual([
      ['Rozpočet', 2],
      ['Novinky', 1],
    ]);
  });

  it('holds back the replies to a held reply until its original is ingested', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    server.addMailbox('Projekty', 'custom');
    deliverMail(server, 'Projekty', { id: 'p1', subject: 'Rozpočet', from: ME, date: day(11) });
    deliverMail(server, 'INBOX', { id: 'r1', subject: 'Re: Rozpočet', date: day(12) });
    deliverMail(server, 'INBOX', { id: 'n1', subject: 'Novinky', date: day(13) });
    deliverMail(server, 'INBOX', {
      id: 'c1',
      subject: 'Re: Rozpočet',
      date: day(14),
      inReplyTo: 'r1',
      references: ['r1'],
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server)).toEqual(['INBOX:2', 'Projekty:1', 'INBOX:1', 'INBOX:3']);
    expect(await inboxThreads(engine)).toEqual([
      ['Rozpočet', 3],
      ['Novinky', 1],
    ]);
  });

  it('does not let an original outside the window keep its reply in the primary phase', async () => {
    const engine = createTestEngine({ sync: { initialWindowDays: 2 } });
    const { account, server } = await seedAccount(engine);
    server.addMailbox('Projekty', 'custom');
    const original = { id: 'p1', subject: 'Rozpočet', from: ME, date: day(11) };
    deliverMail(server, 'Sent', original);
    deliverMail(server, 'Projekty', original);
    deliverMail(server, 'INBOX', { id: 'r1', subject: 'Re: Rozpočet', date: day(14) });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server)).toEqual(['Projekty:1', 'INBOX:1']);
    expect(await inboxThreads(engine)).toEqual([['Rozpočet', 2]]);
  });

  it('downloads a held reply once when a trash relative lookup already ingested it', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Trash', { id: 't1', subject: 'Plán', date: day(10) });
    deliverMail(server, 'INBOX', { id: 'h1', subject: 'Re: Termín', date: day(12) });
    deliverMail(server, 'INBOX', {
      id: 'r1',
      subject: 'Re: Termín',
      date: day(13),
      inReplyTo: 'h1',
      references: ['h1', 't1'],
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server).filter((entry) => entry === 'INBOX:2')).toHaveLength(1);
    expect(engine.db.tables.messages.size).toBe(3);
  });

  it('keeps the order of the primary mailboxes when no mailbox is deferred', async () => {
    const engine = createTestEngine({ sync: { mailboxRoles: ['inbox', 'sent', 'archive'] } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'Sent', { id: 's1', subject: 'Ponuka', from: ME, date: day(12) });
    deliverMail(server, 'INBOX', { id: 'n1', subject: 'Novinky', date: day(13) });
    deliverMail(server, 'INBOX', { id: 'r1', subject: 'Re: Ponuka', date: day(14) });
    deliverMail(server, 'Archive', { id: 'a1', subject: 'Faktúra', date: day(11) });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(streamed(server)).toEqual(['INBOX:1', 'Sent:1', 'INBOX:2', 'Archive:1']);
    expect(await inboxThreads(engine)).toEqual([
      ['Ponuka', 2],
      ['Novinky', 1],
    ]);
  });
});
