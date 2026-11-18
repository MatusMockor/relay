import type { Mailbox, MailboxRole, ThreadId } from '@relay/shared/domain';
import { deliverMail, ME, present, seedAccount, type SeededAccount } from './fixtures';
import { type TestEngine, USER_ID } from './test-engine';

export const FOLDER_DATE = '2026-11-14T08:00:00.000Z';

export const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

export const syncFolders = (engine: TestEngine, seeded: SeededAccount): Promise<unknown> =>
  engine.services.sync.syncAccount(USER_ID, seeded.account.id);

export const imapFolders = async (engine: TestEngine): Promise<SeededAccount> => {
  const seeded = await seedAccount(engine);
  seeded.server.addMailbox('Projekty', 'custom', 301);
  seeded.server.addMailbox('Projekty/Alfa', 'custom', 302);
  deliverMail(seeded.server, 'Projekty/Alfa', { id: 'a1', subject: 'Alfa', date: FOLDER_DATE });
  await syncFolders(engine, seeded);
  return seeded;
};

export const gmailFolders = async (engine: TestEngine): Promise<SeededAccount> => {
  const seeded = await seedAccount(engine, { settings: GMAIL_SETTINGS }, { gmail: true });
  seeded.server.addMailbox('[Gmail]/Starred', 'system');
  seeded.server.addMailbox('Klienti', 'label', 501);
  seeded.server.addMailbox('Klienti/Acme', 'label', 502);
  const mail = {
    id: 'g1',
    labels: ['\\Inbox', 'Klienti/Acme'],
    emailId: 'gm-1',
    date: FOLDER_DATE,
  };
  deliverMail(seeded.server, 'INBOX', mail);
  deliverMail(seeded.server, 'Archive', mail);
  await syncFolders(engine, seeded);
  return seeded;
};

export const storedFolder = async (
  engine: TestEngine,
  seeded: SeededAccount,
  path: string,
): Promise<Mailbox> =>
  present(await engine.repositories.mailboxes.findByPath(seeded.account.id, path));

export const roleFolder = async (
  engine: TestEngine,
  seeded: SeededAccount,
  role: MailboxRole,
): Promise<Mailbox> =>
  present(await engine.repositories.mailboxes.findByRole(seeded.account.id, role));

export const folderThreads = async (engine: TestEngine, mailbox: Mailbox): Promise<ThreadId[]> =>
  (
    await engine.services.inbox.list(USER_ID, { view: 'mailbox', mailboxId: mailbox.id, limit: 20 })
  ).items.map((item) => item.id);
