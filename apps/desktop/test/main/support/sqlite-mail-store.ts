import type { Repositories } from '@relay/engine';
import {
  AccountIdSchema,
  type MailAccount,
  MailboxIdSchema,
  type MailboxRole,
} from '@relay/shared/domain';
import {
  createSqliteRepositories,
  LOCAL_USER_ID,
  migrate,
  openDatabase,
  type SqliteDatabase,
} from '@relay/store-sqlite';

export interface SqliteMailStore {
  readonly database: SqliteDatabase;
  readonly repositories: Repositories;
}

export const openSqliteMailStore = (): SqliteMailStore => {
  const database = openDatabase(':memory:');
  migrate(database);
  return { database, repositories: createSqliteRepositories(database) };
};

export const storedAccount = (id: string, overrides: Partial<MailAccount> = {}): MailAccount => ({
  id: AccountIdSchema.parse(id),
  userId: LOCAL_USER_ID,
  provider: 'imap',
  displayName: 'Práca',
  senderName: null,
  email: `${id}@firma.sk`,
  color: '#4f6ef7',
  isPrimary: false,
  syncIntervalSeconds: 300,
  settings: {
    imap: { host: 'imap.firma.sk', port: 993, secure: true },
    smtp: { host: 'smtp.firma.sk', port: 465, secure: true },
    username: `${id}@firma.sk`,
  },
  status: 'connected',
  lastError: null,
  lastSyncedAt: null,
  createdAt: '2026-11-01T08:00:00.000Z',
  ...overrides,
});

export const storeMailbox = async (
  store: SqliteMailStore,
  account: MailAccount,
  role: MailboxRole,
  unreadCount: number,
): Promise<void> => {
  const path = role === 'inbox' ? 'INBOX' : role;
  await store.repositories.mailboxes.upsertMany(account.id, [
    {
      id: MailboxIdSchema.parse(`${account.id}-${role}`),
      accountId: account.id,
      name: path,
      path,
      delimiter: '/',
      role,
      unreadCount,
      totalCount: unreadCount + 10,
    },
  ]);
};
