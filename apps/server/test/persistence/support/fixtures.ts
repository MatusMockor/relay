import { randomBytes } from 'node:crypto';
import {
  DEFAULT_USER_SETTINGS,
  type AccountId,
  type Device,
  type EntityIdMap,
  type EntityKind,
  type Mailbox,
  type MailboxRole,
  type MailAccount,
  type Message,
  type ThreadSummary,
  type User,
  type UserId,
  type UserSettings,
} from '@relay/shared/domain';
import type { ServerRepositories } from '../../../src/core/ports/server-unit-of-work';

let lastUid = 0;

const nextUid = (): number => {
  lastUid += 1;
  return lastUid;
};

export const newId = <Kind extends EntityKind>(kind: Kind): EntityIdMap[Kind] =>
  `${kind}_${randomBytes(8).toString('hex')}` as EntityIdMap[Kind];

export const at = (minutes: number): string =>
  new Date(Date.UTC(2026, 10, 1, 8, 0, 0) + minutes * 60_000).toISOString();

export const buildUser = (overrides: Partial<User> = {}): User => ({
  id: newId('user'),
  email: `${randomBytes(4).toString('hex')}@relay.test`,
  displayName: 'Ján Testovací',
  createdAt: at(0),
  ...overrides,
});

export const buildDevice = (userId: UserId, overrides: Partial<Device> = {}): Device => ({
  id: newId('device'),
  userId,
  name: 'MacBook',
  platform: 'macos',
  createdAt: at(0),
  lastSeenAt: at(0),
  ...overrides,
});

export const buildAccount = (
  userId: UserId,
  overrides: Partial<MailAccount> = {},
): MailAccount => ({
  id: newId('account'),
  userId,
  provider: 'imap',
  displayName: 'Práca',
  senderName: 'Ján Testovací',
  email: `${randomBytes(4).toString('hex')}@firma.sk`,
  color: '#3366ff',
  isPrimary: false,
  syncIntervalSeconds: 300,
  settings: {
    imap: { host: 'imap.firma.sk', port: 993, secure: true },
    smtp: { host: 'smtp.firma.sk', port: 465, secure: true },
    username: 'jan',
  },
  status: 'connected',
  lastError: null,
  lastSyncedAt: null,
  createdAt: at(0),
  ...overrides,
});

export const buildMailbox = (
  accountId: AccountId,
  role: MailboxRole,
  overrides: Partial<Mailbox> = {},
): Mailbox => ({
  id: newId('mailbox'),
  accountId,
  name: role.toUpperCase(),
  path: role === 'inbox' ? 'INBOX' : role,
  delimiter: '/',
  role,
  unreadCount: 0,
  totalCount: 0,
  ...overrides,
});

export const buildThread = (
  accountId: AccountId,
  overrides: Partial<ThreadSummary> = {},
): ThreadSummary => ({
  id: newId('thread'),
  accountId,
  subject: 'Stretnutie',
  participants: [{ name: 'Eva', email: 'eva@firma.sk' }],
  lastMessageAt: at(10),
  messageCount: 1,
  unread: true,
  snippet: 'Ahoj',
  aiOneLiner: null,
  jiraKey: null,
  jiraActor: null,
  splitIds: [],
  labelIds: [],
  state: 'inbox',
  remindAt: null,
  hasDraft: false,
  ...overrides,
});

export const buildMessage = (
  thread: ThreadSummary,
  mailbox: Mailbox,
  overrides: Partial<Message> = {},
): Message => ({
  id: newId('message'),
  threadId: thread.id,
  accountId: thread.accountId,
  mailboxId: mailbox.id,
  uid: nextUid(),
  messageIdHeader: `<${randomBytes(6).toString('hex')}@firma.sk>`,
  inReplyTo: null,
  references: [],
  from: { name: 'Eva Nováková', email: 'eva@firma.sk' },
  to: [{ name: null, email: 'jan@relay.test' }],
  cc: [],
  bcc: [],
  replyTo: [],
  subject: thread.subject,
  date: thread.lastMessageAt,
  snippet: thread.snippet,
  textBody: 'Ahoj, posielam podklady.',
  htmlBody: null,
  flags: { seen: false, flagged: false, answered: false },
  labelIds: [],
  attachments: [],
  ...overrides,
});

export const defaultSettings = (): UserSettings => structuredClone(DEFAULT_USER_SETTINGS);

export interface MailboxSet {
  readonly inbox: Mailbox;
  readonly sent: Mailbox;
}

export interface SeededAccount {
  readonly user: User;
  readonly account: MailAccount;
  readonly mailboxes: MailboxSet;
}

export const mailboxByRole = (mailboxes: readonly Mailbox[], role: MailboxRole): Mailbox =>
  mailboxes.find((mailbox) => mailbox.role === role) ?? buildMailbox('missing' as AccountId, role);

export const seedAccount = async (
  repositories: ServerRepositories,
  user: User = buildUser(),
): Promise<SeededAccount> => {
  const existing = await repositories.users.findById(user.id);
  if (existing === null) {
    await repositories.users.create(user, 'hash');
  }
  const account = await repositories.accounts.create(buildAccount(user.id));
  const mailboxes = await repositories.mailboxes.upsertMany(account.id, [
    buildMailbox(account.id, 'inbox'),
    buildMailbox(account.id, 'sent'),
  ]);
  return {
    user,
    account,
    mailboxes: { inbox: mailboxByRole(mailboxes, 'inbox'), sent: mailboxByRole(mailboxes, 'sent') },
  };
};

export const seedThread = async (
  repositories: ServerRepositories,
  seeded: SeededAccount,
  threadOverrides: Partial<ThreadSummary> = {},
  messageOverrides: Partial<Message> = {},
): Promise<{ thread: ThreadSummary; message: Message }> => {
  const thread = buildThread(seeded.account.id, threadOverrides);
  const message = buildMessage(thread, seeded.mailboxes.inbox, messageOverrides);
  const storedMessage = await repositories.messages.upsert(message, new Map());
  const storedThread = await repositories.threads.upsert(thread);
  return { thread: storedThread, message: storedMessage };
};
