import type { Draft, DraftContent, DraftId, ThreadId, UserId } from '@relay/shared/domain';

export interface DraftRepository {
  listByUser(userId: UserId): Promise<Draft[]>;
  findById(userId: UserId, draftId: DraftId): Promise<Draft | null>;
  findByThread(userId: UserId, threadId: ThreadId): Promise<Draft | null>;
  create(userId: UserId, draft: Draft): Promise<Draft>;
  update(
    userId: UserId,
    draftId: DraftId,
    changes: Partial<DraftContent>,
    updatedAt: string,
  ): Promise<Draft | null>;
  delete(userId: UserId, draftId: DraftId): Promise<boolean>;
}
