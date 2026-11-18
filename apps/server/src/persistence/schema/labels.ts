import type { AccountId, LabelId, LabelKind, MessageId, UserId } from '@relay/shared/domain';
import { index, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { messages } from './messages';
import { users } from './users';

export const labels = pgTable(
  'labels',
  {
    id: text('id').$type<LabelId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    kind: text('kind').$type<LabelKind>().notNull().default('keyword'),
    remoteName: text('remote_name').notNull(),
  },
  (table) => [
    uniqueIndex('labels_account_name_unique').on(table.accountId, table.name),
    uniqueIndex('labels_account_kind_remote_unique').on(
      table.accountId,
      table.kind,
      table.remoteName,
    ),
    index('labels_user_idx').on(table.userId),
  ],
);

export const messageLabels = pgTable(
  'message_labels',
  {
    messageId: text('message_id')
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .$type<LabelId>()
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.labelId] }),
    index('message_labels_label_idx').on(table.labelId),
  ],
);
