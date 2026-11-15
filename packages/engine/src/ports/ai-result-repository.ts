import type { AiResult, AiResultId, AiTaskKind, ThreadId, UserId } from '@relay/shared/domain';

export interface ChecklistItemChange {
  readonly itemId: string;
  readonly done: boolean;
}

export interface AiResultRepository {
  findLatest(userId: UserId, threadId: ThreadId, kind: AiTaskKind): Promise<AiResult | null>;
  save(result: AiResult): Promise<AiResult>;
  updateChecklistItem(
    userId: UserId,
    resultId: AiResultId,
    change: ChecklistItemChange,
  ): Promise<AiResult | null>;
  deleteByThread(threadId: ThreadId): Promise<void>;
}
