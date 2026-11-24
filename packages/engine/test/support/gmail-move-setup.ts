import type { ThreadAction, ThreadSummary } from '@relay/shared/domain';
import { expect } from 'vitest';
import { deliverMail, type MailSpec, ME, present, seedAccount } from './fixtures';
import type { FakeMailServer, FakeMailServerOptions } from './mail/fake-mail-server';
import { type TestEngine, USER_ID } from './test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
export const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

export const GMAIL_FIRST: MailSpec = {
  id: 'g1',
  labels: ['\\Inbox'],
  emailId: 'gm-1',
  date: DATE,
};

export const inboxAndAllMail = (server: FakeMailServer, spec: MailSpec = GMAIL_FIRST) => {
  deliverMail(server, 'INBOX', spec);
  deliverMail(server, 'Archive', spec);
};

export const seedGmailAccount = (engine: TestEngine, options: FakeMailServerOptions = {}) =>
  seedAccount(engine, { settings: GMAIL_SETTINGS }, { gmail: true, ...options });

export const gmailMoveThread = async (
  engine: TestEngine,
  deliver: (server: FakeMailServer) => void,
) => {
  const { account, server } = await seedGmailAccount(engine);
  server.addMailbox('Spam', 'spam');
  server.addMailbox('Klienti', 'label', 501);
  deliver(server);
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const threads = [...engine.db.tables.threads.values()];
  expect(threads).toHaveLength(1);
  const label = present(
    await engine.repositories.labels.findByRemoteName(account.id, 'gmail', 'Klienti'),
  );
  const target = present(await engine.repositories.mailboxes.findByPath(account.id, 'Klienti'));
  const thread: ThreadSummary = present(threads[0]);
  const act = (action: ThreadAction) => engine.services.actions.apply(USER_ID, thread.id, action);
  return { account, server, thread, label, target, act };
};

export const providerOps = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'provider-op');
