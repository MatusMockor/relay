import { type Mailbox, MailboxSchema } from '@relay/shared/domain';
import type { MailboxRow } from '../schema';

export const toMailbox = (row: MailboxRow): Mailbox =>
  MailboxSchema.parse({
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    path: row.path,
    delimiter: row.delimiter,
    role: row.role,
    unreadCount: row.unreadCount,
    totalCount: row.totalCount,
  });
