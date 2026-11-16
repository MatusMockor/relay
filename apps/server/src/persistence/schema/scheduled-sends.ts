import type {
  AccountId,
  DraftId,
  ScheduledSendId,
  ScheduledSendStatus,
  UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { timestampTz } from './columns';
import { drafts } from './drafts';
import { users } from './users';

export const scheduledSends = pgTable(
  'scheduled_sends',
  {
    id: text('id').$type<ScheduledSendId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    draftId: text('draft_id')
      .$type<DraftId>()
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    scheduledAt: timestampTz('scheduled_at').notNull(),
    status: text('status').$type<ScheduledSendStatus>().notNull(),
    error: text('error'),
    sentAt: timestampTz('sent_at'),
    claimedAt: timestampTz('claimed_at'),
    renewedAt: timestampTz('renewed_at'),
    createdAt: timestampTz('created_at').notNull(),
  },
  (table) => [
    index('scheduled_sends_user_idx').on(table.userId, table.status, table.scheduledAt),
    index('scheduled_sends_due_idx')
      .on(table.scheduledAt)
      .where(sql`${table.status} = 'pending'`),
    index('scheduled_sends_draft_idx').on(table.draftId),
    uniqueIndex('scheduled_sends_active_draft_idx')
      .on(table.draftId)
      .where(sql`${table.status} in ('pending', 'sending')`),
  ],
);
