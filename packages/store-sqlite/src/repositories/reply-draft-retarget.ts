import { eq } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { drafts } from '../schema';

export const retargetReplyDrafts = (db: RelayDb, from: string, to: string): void => {
  db.update(drafts)
    .set({ inReplyToMessageId: to })
    .where(eq(drafts.inReplyToMessageId, from))
    .run();
};
