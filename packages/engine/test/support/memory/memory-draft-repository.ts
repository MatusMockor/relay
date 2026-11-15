import type { Draft, DraftContent, DraftId, ThreadId, UserId } from '@relay/shared/domain';
import { ConflictError, type DraftRepository } from '../../../src';
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
    if (this.usedElsewhere(draft.id, draft.attachments)) {
      return Promise.reject(new ConflictError('The record conflicts with an existing record'));
    }
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
    if (changes.attachments !== undefined && this.usedElsewhere(draftId, changes.attachments)) {
      return Promise.reject(new ConflictError('The record conflicts with an existing record'));
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

  deleteRevision(userId: UserId, draftId: DraftId, updatedAt: string): Promise<boolean> {
    const stored = this.db.tables.drafts.get(draftId);
    if (stored?.userId !== userId || stored.draft.updatedAt !== updatedAt) {
      return Promise.resolve(false);
    }
    return Promise.resolve(this.db.tables.drafts.delete(draftId));
  }

  private usedElsewhere(draftId: DraftId, attachments: Draft['attachments']): boolean {
    const ids = new Set(attachments.map((attachment) => attachment.id));
    return [...this.db.tables.drafts.values()].some(
      (stored) =>
        stored.draft.id !== draftId &&
        stored.draft.attachments.some((attachment) => ids.has(attachment.id)),
    );
  }

  private byUser(userId: UserId): Draft[] {
    return [...this.db.tables.drafts.values()]
      .filter((stored) => stored.userId === userId)
      .map((stored) => stored.draft);
  }
}
