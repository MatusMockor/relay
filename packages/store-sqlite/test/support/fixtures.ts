import {
  AccountIdSchema,
  type MailAccount,
  type Mailbox,
  MailboxIdSchema,
  type Message,
  MessageIdSchema,
  type ThreadSummary,
  ThreadIdSchema,
  UserIdSchema,
} from '@relay/shared/domain';
import { LOCAL_USER_ID } from '../../src';

export const accountId = (value: string) => AccountIdSchema.parse(value);
export const mailboxId = (value: string) => MailboxIdSchema.parse(value);
export const threadId = (value: string) => ThreadIdSchema.parse(value);
export const messageId = (value: string) => MessageIdSchema.parse(value);

export const buildAccount = (overrides: Partial<MailAccount> = {}): MailAccount => ({
  id: accountId('acc-1'),
  userId: LOCAL_USER_ID,
  provider: 'imap',
  displayName: 'Práca',
  senderName: 'Ján Novák',
  email: 'jan@firma.sk',
  color: '#3366ff',
  isPrimary: false,
  syncIntervalSeconds: 300,
  settings: {
    imap: { host: 'imap.firma.sk', port: 993, secure: true },
    smtp: { host: 'smtp.firma.sk', port: 465, secure: true },
    username: 'jan@firma.sk',
  },
  status: 'connected',
  lastError: null,
  lastSyncedAt: null,
  createdAt: '2026-11-01T08:00:00.000Z',
  ...overrides,
});

export const buildMailbox = (overrides: Partial<Mailbox> = {}): Mailbox => ({
  id: mailboxId('mbx-inbox'),
  accountId: accountId('acc-1'),
  name: 'INBOX',
  path: 'INBOX',
  delimiter: '/',
  role: 'inbox',
  subscribed: true,
  uidValidity: null,
  unreadCount: 0,
  totalCount: 0,
  ...overrides,
});

export const buildThread = (overrides: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id: threadId('thr-1'),
  accountId: accountId('acc-1'),
  subject: 'Faktúra za október',
  participants: [{ name: 'Jana Nováková', email: 'jana@klient.sk' }],
  lastMessageAt: '2026-11-10T10:00:00.000Z',
  messageCount: 1,
  unread: true,
  snippet: 'Dobrý deň, posielam faktúru',
  aiOneLiner: null,
  jiraKey: null,
  jiraActor: null,
  splitIds: [],
  labelIds: [],
  state: 'inbox',
  markedDone: false,
  remindAt: null,
  hasDraft: false,
  ...overrides,
});

export const buildMessage = (overrides: Partial<Message> = {}): Message => ({
  id: messageId('msg-1'),
  threadId: threadId('thr-1'),
  accountId: accountId('acc-1'),
  mailboxId: mailboxId('mbx-inbox'),
  uid: 1,
  messageIdHeader: '<msg-1@klient.sk>',
  emailId: null,
  inReplyTo: null,
  references: [],
  from: { name: 'Jana Nováková', email: 'jana@klient.sk' },
  to: [{ name: null, email: 'jan@firma.sk' }],
  cc: [],
  bcc: [],
  replyTo: [],
  subject: 'Faktúra za október',
  date: '2026-11-10T10:00:00.000Z',
  snippet: 'Dobrý deň, posielam faktúru',
  textBody: 'Dobrý deň, posielam faktúru za október.',
  htmlBody: null,
  flags: { seen: false, flagged: false, answered: false },
  labelIds: [],
  attachments: [],
  ...overrides,
});

export const NO_HEADERS: ReadonlyMap<string, readonly string[]> = new Map();

export const userId = (value: string) => UserIdSchema.parse(value);
