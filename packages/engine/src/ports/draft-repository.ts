import type {
  Draft,
  DraftContent,
  DraftId,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';

export interface DraftRevision {
  readonly expected: string;
  readonly next: string;
}

export interface DraftSendClaim {
  readonly claimedAt: string;
  readonly staleBefore: string;
}

export interface DraftSendRenewal {
  readonly claimedAt: string;
  readonly renewedAt: string;
}

export interface DraftRepository {
  listByUser(userId: UserId): Promise<Draft[]>;
  findById(userId: UserId, draftId: DraftId): Promise<Draft | null>;
  findByThread(userId: UserId, threadId: ThreadId): Promise<Draft | null>;
  create(userId: UserId, draft: Draft): Promise<Draft>;
  update(
    userId: UserId,
    draftId: DraftId,
    changes: Partial<DraftContent>,
    revision: DraftRevision,
  ): Promise<Draft | null>;
  delete(userId: UserId, draftId: DraftId): Promise<boolean>;
  deleteRevision(userId: UserId, draftId: DraftId, updatedAt: string): Promise<boolean>;
  claimForSend(userId: UserId, draftId: DraftId, claim: DraftSendClaim): Promise<boolean>;
  releaseSendClaim(userId: UserId, draftId: DraftId, claimedAt: string): Promise<boolean>;
  renewSendClaim(userId: UserId, draftId: DraftId, renewal: DraftSendRenewal): Promise<boolean>;
  retargetReplies(from: MessageId, to: MessageId): Promise<void>;
}
