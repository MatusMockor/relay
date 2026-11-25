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
