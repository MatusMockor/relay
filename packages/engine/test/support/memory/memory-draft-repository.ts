import type {
  Draft,
  DraftContent,
  DraftId,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import {
  ConflictError,
  type DraftRepository,
  type DraftRevision,
  type DraftSendClaim,
  type DraftSendRenewal,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryDraftRepository implements DraftRepository {
  failDeleteRevision: string | null = null;
  beforeDeleteRevision: (() => Promise<void>) | null = null;
  afterWrite: (() => Promise<void>) | null = null;

  constructor(private readonly db: MemoryDatabase) {}

  listByUser(userId: UserId): Promise<Draft[]> {
    return Promise.resolve(this.byUser(userId));
  }

  findById(userId: UserId, draftId: DraftId): Promise<Draft | null> {
    const stored = this.db.tables.drafts.get(draftId);
    return Promise.resolve(stored?.userId === userId ? stored.draft : null);
  }

  retargetReplies(from: MessageId, to: MessageId): Promise<void> {
    this.db.tables.drafts.forEach((stored, draftId) => {
      if (stored.draft.inReplyToMessageId === from) {
        this.db.tables.drafts.set(draftId, {
          ...stored,
          draft: { ...stored.draft, inReplyToMessageId: to },
        });
      }
    });
    return Promise.resolve();
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

  async update(
    userId: UserId,
    draftId: DraftId,
    changes: Partial<DraftContent>,
    revision: DraftRevision,
  ): Promise<Draft | null> {
    const stored = this.db.tables.drafts.get(draftId);
    if (stored?.userId !== userId || stored.draft.updatedAt !== revision.expected) {
      return null;
    }
    if (changes.attachments !== undefined && this.usedElsewhere(draftId, changes.attachments)) {
      return Promise.reject(new ConflictError('The record conflicts with an existing record'));
    }
    const draft: Draft = { ...stored.draft, ...changes, updatedAt: revision.next };
    this.db.tables.drafts.set(draftId, { userId, draft });
    await this.runAfterWrite();
    return draft;
  }

  delete(userId: UserId, draftId: DraftId): Promise<boolean> {
    if (this.db.tables.drafts.get(draftId)?.userId !== userId) {
      return Promise.resolve(false);
    }
    return Promise.resolve(this.remove(draftId));
  }

  async deleteRevision(userId: UserId, draftId: DraftId, updatedAt: string): Promise<boolean> {
    await this.beforeDeleteRevision?.();
    if (this.failDeleteRevision !== null) {
      return Promise.reject(new Error(this.failDeleteRevision));
    }
    const stored = this.db.tables.drafts.get(draftId);
    if (stored?.userId !== userId || stored.draft.updatedAt !== updatedAt) {
      return false;
    }
    const removed = this.remove(draftId);
    await this.runAfterWrite();
    return removed;
  }

  private async runAfterWrite(): Promise<void> {
    const hook = this.afterWrite;
    this.afterWrite = null;
    await hook?.();
  }

  claimForSend(userId: UserId, draftId: DraftId, claim: DraftSendClaim): Promise<boolean> {
    if (this.db.tables.drafts.get(draftId)?.userId !== userId) {
      return Promise.resolve(false);
    }
    const current =
      this.db.tables.draftSendRenewals.get(draftId) ?? this.db.tables.draftSendClaims.get(draftId);
    if (current !== undefined && Date.parse(current) >= Date.parse(claim.staleBefore)) {
      return Promise.resolve(false);
    }
    this.db.tables.draftSendClaims.set(draftId, claim.claimedAt);
    this.db.tables.draftSendRenewals.delete(draftId);
    return Promise.resolve(true);
  }

  renewSendClaim(userId: UserId, draftId: DraftId, renewal: DraftSendRenewal): Promise<boolean> {
    const owned = this.db.tables.drafts.get(draftId)?.userId === userId;
    if (!owned || this.db.tables.draftSendClaims.get(draftId) !== renewal.claimedAt) {
      return Promise.resolve(false);
    }
    this.db.tables.draftSendRenewals.set(draftId, renewal.renewedAt);
    return Promise.resolve(true);
  }

  releaseSendClaim(userId: UserId, draftId: DraftId, claimedAt: string): Promise<boolean> {
    const owned = this.db.tables.drafts.get(draftId)?.userId === userId;
    if (!owned || this.db.tables.draftSendClaims.get(draftId) !== claimedAt) {
      return Promise.resolve(false);
    }
    this.db.tables.draftSendRenewals.delete(draftId);
    return Promise.resolve(this.db.tables.draftSendClaims.delete(draftId));
  }

  private usedElsewhere(draftId: DraftId, attachments: Draft['attachments']): boolean {
    const ids = new Set(attachments.map((attachment) => attachment.id));
    return [...this.db.tables.drafts.values()].some(
      (stored) =>
        stored.draft.id !== draftId &&
        stored.draft.attachments.some((attachment) => ids.has(attachment.id)),
    );
  }

  private remove(draftId: DraftId): boolean {
    this.db.tables.draftSendClaims.delete(draftId);
    this.db.tables.draftSendRenewals.delete(draftId);
    return this.db.tables.drafts.delete(draftId);
  }

  private byUser(userId: UserId): Draft[] {
    return [...this.db.tables.drafts.values()]
      .filter((stored) => stored.userId === userId)
      .map((stored) => stored.draft);
  }
}
