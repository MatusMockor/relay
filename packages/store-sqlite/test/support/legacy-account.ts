import type { MailAccount, Mailbox } from '@relay/shared/domain';
import type { SqliteDatabase } from '../../src';
import { buildAccount, buildMailbox, mailboxId } from './fixtures';
import type { SeededAccount } from './seed';

export const insertLegacyAccount = (
  database: SqliteDatabase,
  overrides: Partial<MailAccount> = {},
): MailAccount => {
  const account = buildAccount(overrides);
  database.sqlite
    .prepare(
      `insert into accounts (id, user_id, provider, display_name, email, color, is_primary, sync_interval_seconds, settings, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      account.id,
      account.userId,
      account.provider,
      account.displayName,
      account.email,
      account.color,
      account.isPrimary ? 1 : 0,
      account.syncIntervalSeconds,
      JSON.stringify(account.settings),
      account.status,
      account.createdAt,
    );
  return account;
};

const insertLegacyMailbox = (database: SqliteDatabase, mailbox: Mailbox): Mailbox => {
  database.sqlite
    .prepare(
      `insert into mailboxes (id, account_id, name, path, delimiter, role, unread_count, total_count) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      mailbox.id,
      mailbox.accountId,
      mailbox.name,
      mailbox.path,
      mailbox.delimiter,
      mailbox.role,
      mailbox.unreadCount,
      mailbox.totalCount,
    );
  return mailbox;
};

export const seedLegacyAccount = (database: SqliteDatabase): Promise<SeededAccount> => {
  const account = insertLegacyAccount(database);
  const inbox = insertLegacyMailbox(
    database,
    buildMailbox({ id: mailboxId(`${account.id}-inbox`), accountId: account.id }),
  );
  const sent = insertLegacyMailbox(
    database,
    buildMailbox({
      id: mailboxId(`${account.id}-sent`),
      accountId: account.id,
      name: 'Sent',
      path: 'Sent',
      role: 'sent',
    }),
  );
  return Promise.resolve({ account, inbox, sent });
};
