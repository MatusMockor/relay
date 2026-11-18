import type { ThreadSummary } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
const RECEIVED: MailSpec = { id: 'm1', date: DATE };
const PETER = { name: 'Peter Kral', email: 'peter@partner.test' };
const REPLY: MailSpec = {
  id: 'r1',
  from: ME,
  to: [PETER],
  inReplyTo: 'm1',
  references: ['m1'],
  date: DATE,
};

const remoteCount = (server: FakeMailServer, path: string): number =>
  server.mailbox(path).messages.size;

const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

const gmailAccount = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine, { settings: GMAIL_SETTINGS }, { gmail: true });
  seeded.server.addMailbox('Spam', 'spam');
  return seeded;
};

const onlyThread = (engine: TestEngine): ThreadSummary => {
  const threads = [...engine.db.tables.threads.values()];
  expect(threads).toHaveLength(1);
  return present(threads[0]);
};

const pendingRecords = (engine: TestEngine) =>
  [...engine.db.tables.messages.values()].filter((message) => message.uid === 0);

const pendingOps = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'provider-op');

describe('spam and trash with Gmail copies in INBOX and All Mail', () => {
  it.each([
    ['reportSpam', 'notSpam', 'Spam'],
    ['trash', 'restore', 'Trash'],
  ] as const)(
    'moves one copy on %s and its undo returns the message to INBOX',
    async (action, undo, path) => {
      const engine = createTestEngine();
      const { account, server } = await gmailAccount(engine);
      deliverMail(server, 'INBOX', RECEIVED);
      deliverMail(server, 'Archive', RECEIVED);
      await engine.services.sync.syncAccount(USER_ID, account.id);
      const thread = onlyThread(engine);

      await engine.services.actions.apply(USER_ID, thread.id, { type: action });

      expect(remoteCount(server, path)).toBe(1);
      expect(pendingRecords(engine)).toEqual([]);
      expect(pendingOps(engine)).toEqual([]);

      const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: undo });
      await engine.services.sync.syncAccount(USER_ID, account.id);

      expect(restored.state).toBe('inbox');
      expect(remoteCount(server, 'INBOX')).toBe(1);
      expect(remoteCount(server, path)).toBe(0);
      expect(pendingRecords(engine)).toEqual([]);
      expect(pendingOps(engine)).toEqual([]);
      expect(onlyThread(engine).state).toBe('inbox');
    },
  );

  it('keeps a spam thread with your reply filed in All Mail in spam', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    deliverMail(server, 'Spam', RECEIVED);
    deliverMail(server, 'Sent', REPLY);
    deliverMail(server, 'Archive', REPLY);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(onlyThread(engine).state).toBe('spam');
  });

  it('keeps a spam thread in spam when your reply arrives in Sent and All Mail', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    deliverMail(server, 'Spam', RECEIVED);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    deliverMail(server, 'Sent', REPLY);
    deliverMail(server, 'Archive', REPLY);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(onlyThread(engine).state).toBe('spam');
  });

  it('restores a trashed spam thread with your filed reply to spam', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    deliverMail(server, 'Spam', RECEIVED);
    deliverMail(server, 'Sent', REPLY);
    deliverMail(server, 'Archive', REPLY);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const thread = onlyThread(engine);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: 'restore' });

    expect(restored.state).toBe('spam');
    expect(remoteCount(server, 'Spam')).toBe(1);
    expect(remoteCount(server, 'Sent')).toBe(1);
  });

  it('refuses to report a thread of your own mail that Gmail also files in All Mail', async () => {
    const engine = createTestEngine();
    const { account, server } = await gmailAccount(engine);
    const own: MailSpec = { id: 's1', from: ME, to: [PETER], date: DATE };
    deliverMail(server, 'Sent', own);
    deliverMail(server, 'Archive', own);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await expect(
      engine.services.actions.apply(USER_ID, onlyThread(engine).id, { type: 'reportSpam' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(remoteCount(server, 'Sent')).toBe(1);
    expect(remoteCount(server, 'Archive')).toBe(1);
    expect(remoteCount(server, 'Spam')).toBe(0);
  });
});
