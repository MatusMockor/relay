import type { AiResult, AiTaskKind, ThreadId, UserId } from '@relay/shared/domain';

export interface AiResultRepository {
  findLatest(userId: UserId, threadId: ThreadId, kind: AiTaskKind): Promise<AiResult | null>;
  save(result: AiResult): Promise<AiResult>;
  deleteByThread(threadId: ThreadId): Promise<void>;
}
