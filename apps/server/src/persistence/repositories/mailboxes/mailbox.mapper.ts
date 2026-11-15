import type { Mailbox, UserId } from '@relay/shared/domain';
import type { mailboxes } from '../../schema';

type MailboxRow = typeof mailboxes.$inferSelect;
type MailboxInsert = typeof mailboxes.$inferInsert;

export const toMailbox = (row: MailboxRow): Mailbox => ({
  id: row.id,
  accountId: row.accountId,
  name: row.name,
  path: row.path,
  delimiter: row.delimiter,
  role: row.role,
  unreadCount: row.unreadCount,
  totalCount: row.totalCount,
});

export const toMailboxInsert = (userId: UserId, mailbox: Mailbox): MailboxInsert => ({
  id: mailbox.id,
  userId,
  accountId: mailbox.accountId,
  name: mailbox.name,
  path: mailbox.path,
  delimiter: mailbox.delimiter,
  role: mailbox.role,
  unreadCount: mailbox.unreadCount,
  totalCount: mailbox.totalCount,
});
