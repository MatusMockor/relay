import type { MailAccount, ThreadSummary } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
const PETER = { name: 'Peter Kral', email: 'peter@partner.test' };

const GMAIL_SETTINGS: MailAccount['settings'] = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

const remoteCount = (server: FakeMailServer, path: string): number =>
  server.mailbox(path).messages.size;

const withSpam = async (
  engine: TestEngine,
  overrides: Partial<MailAccount> = {},
  gmail = false,
) => {
  const seeded = await seedAccount(engine, overrides, { gmail });
  seeded.server.addMailbox('Spam', 'spam');
  return seeded;
};

const threadWith = (engine: TestEngine, subject: string): ThreadSummary =>
  present([...engine.db.tables.threads.values()].find((thread) => thread.subject === subject));

describe('mail copies on plain IMAP and Gmail', () => {
  it.each([
    ['reportSpam', 'Spam', 'spam'],
    ['trash', 'Trash', 'trash'],
  ] as const)('moves every independent IMAP copy on %s', async (action, path, state) => {
    const engine = createTestEngine();
    const { account, server } = await withSpam(engine);
    const spec: MailSpec = { id: 'm1', subject: 'Kópie', date: DATE };
    deliverMail(server, 'INBOX', spec);
    deliverMail(server, 'Archive', spec);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await engine.services.actions.apply(USER_ID, threadWith(engine, 'Kópie').id, { type: action });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(remoteCount(server, path)).toBe(2);
    expect(remoteCount(server, 'INBOX')).toBe(0);
    expect(remoteCount(server, 'Archive')).toBe(0);
    expect(threadWith(engine, 'Kópie').state).toBe(state);
  });

  it('pulls the Sent copy of a reply outside the window so the thread stays in spam', async () => {
    const engine = createTestEngine({ sync: { initialMessageLimit: 1 } });
    const { account, server } = await withSpam(engine, { settings: GMAIL_SETTINGS }, true);
    const reply: MailSpec = {
      id: 'r1',
      from: ME,
      to: [PETER],
      subject: 'Re: Výhra',
      inReplyTo: 'm1',
      references: ['m1'],
      date: DATE,
    };
    const later: MailSpec = { id: 'n1', from: ME, to: [PETER], subject: 'Iné', date: DATE };
    deliverMail(server, 'Spam', { id: 'm1', subject: 'Výhra', date: DATE });
    deliverMail(server, 'Sent', reply);
    deliverMail(server, 'Archive', reply);
    deliverMail(server, 'Sent', later);
    deliverMail(server, 'Archive', later);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(threadWith(engine, 'Výhra')).toMatchObject({ state: 'spam', messageCount: 2 });
  });

  it.each([
    ['reportSpam', 'notSpam', 'Spam'],
    ['trash', 'restore', 'Trash'],
  ] as const)(
    'treats archived Gmail mail you sent to yourself as received on %s',
    async (action, undo, path) => {
      const engine = createTestEngine();
      const { account, server } = await withSpam(engine, { settings: GMAIL_SETTINGS }, true);
      const note: MailSpec = { id: 's1', from: ME, to: [ME], subject: 'Poznámka', date: DATE };
      deliverMail(server, 'Sent', note);
      deliverMail(server, 'Archive', note);
      await engine.services.sync.syncAccount(USER_ID, account.id);
      const thread = threadWith(engine, 'Poznámka');

      await engine.services.actions.apply(USER_ID, thread.id, { type: action });
      expect(remoteCount(server, path)).toBe(1);
      expect(remoteCount(server, 'Archive')).toBe(0);

      const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: undo });
      expect(restored.state).toBe('done');
      expect(remoteCount(server, 'Archive')).toBe(1);
    },
  );
});
