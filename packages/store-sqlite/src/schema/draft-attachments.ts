import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drafts } from './drafts';

export const draftAttachments = sqliteTable(
  'draft_attachments',
  {
    id: text('id').primaryKey(),
    draftId: text('draft_id')
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [index('draft_attachments_draft_idx').on(table.draftId, table.position)],
);

export type DraftAttachmentRow = typeof draftAttachments.$inferSelect;
