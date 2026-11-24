import type { MessageId } from '@relay/shared/domain';
import type { MemoryDatabase } from './memory-database';

export const retargetReplyDrafts = (db: MemoryDatabase, from: MessageId, to: MessageId): void => {
  db.tables.drafts.forEach((stored, draftId) => {
    if (stored.draft.inReplyToMessageId === from) {
      db.tables.drafts.set(draftId, {
        ...stored,
        draft: { ...stored.draft, inReplyToMessageId: to },
      });
    }
  });
};
