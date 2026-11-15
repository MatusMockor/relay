import type { Draft, DraftContent, DraftId, ThreadId, UserId } from '@relay/shared/domain';
import type { DraftRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryDraftRepository implements DraftRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listByUser(userId: UserId): Promise<Draft[]> {
    return Promise.resolve(this.byUser(userId));
  }

  findById(userId: UserId, draftId: DraftId): Promise<Draft | null> {
    const stored = this.db.tables.drafts.get(draftId);
    return Promise.resolve(stored?.userId === userId ? stored.draft : null);
  }

  findByThread(userId: UserId, threadId: ThreadId): Promise<Draft | null> {
    const match = this.byUser(userId).find((draft) => draft.inReplyToThreadId === threadId);
    return Promise.resolve(match ?? null);
  }

  create(userId: UserId, draft: Draft): Promise<Draft> {
    this.db.tables.drafts.set(draft.id, { userId, draft });
    return Promise.resolve(draft);
  }

  update(
    userId: UserId,
    draftId: DraftId,
    changes: Partial<DraftContent>,
    updatedAt: string,
  ): Promise<Draft | null> {
    const stored = this.db.tables.drafts.get(draftId);
    if (stored?.userId !== userId) {
      return Promise.resolve(null);
    }
    const draft: Draft = { ...stored.draft, ...changes, updatedAt };
    this.db.tables.drafts.set(draftId, { userId, draft });
    return Promise.resolve(draft);
  }

  delete(userId: UserId, draftId: DraftId): Promise<boolean> {
    if (this.db.tables.drafts.get(draftId)?.userId !== userId) {
      return Promise.resolve(false);
    }
    return Promise.resolve(this.db.tables.drafts.delete(draftId));
  }

  private byUser(userId: UserId): Draft[] {
    return [...this.db.tables.drafts.values()]
      .filter((stored) => stored.userId === userId)
      .map((stored) => stored.draft);
  }
}
