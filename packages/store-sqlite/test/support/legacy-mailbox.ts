import type { Mailbox } from '@relay/shared/domain';
import type { SqliteDatabase } from '../../src';

export const insertLegacyMailbox = (database: SqliteDatabase, mailbox: Mailbox): void => {
  database.sqlite
    .prepare(
      `insert into mailboxes (id, account_id, name, path, delimiter, role, unread_count, total_count) values (?, ?, ?, ?, '/', ?, 0, 0)`,
    )
    .run(mailbox.id, mailbox.accountId, mailbox.name, mailbox.path, mailbox.role);
};
