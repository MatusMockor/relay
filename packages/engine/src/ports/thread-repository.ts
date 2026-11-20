import type { AccountId, ThreadId, ThreadState, ThreadSummary, UserId } from '@relay/shared/domain';
import type { Page } from '../model/page';
import type { ThreadFolderQuery } from '../model/thread-query';

export interface ThreadStateChange {
  readonly state: ThreadState;
  readonly markedDone?: boolean;
  readonly remindAt: string | null;
}

export interface ThreadRepository {
  queryFolder(userId: UserId, query: ThreadFolderQuery): Promise<Page<ThreadSummary>>;
  findById(userId: UserId, threadId: ThreadId): Promise<ThreadSummary | null>;
  findByIdForAccount(accountId: AccountId, threadId: ThreadId): Promise<ThreadSummary | null>;
  lockForUpdate(accountId: AccountId, threadId: ThreadId): Promise<ThreadSummary | null>;
  upsert(thread: ThreadSummary): Promise<ThreadSummary>;
  updateState(
    userId: UserId,
    threadId: ThreadId,
    change: ThreadStateChange,
  ): Promise<ThreadSummary | null>;
  setHasDraft(userId: UserId, threadId: ThreadId, hasDraft: boolean): Promise<ThreadSummary | null>;
  setAiOneLiner(threadId: ThreadId, oneLiner: string | null): Promise<void>;
  delete(threadId: ThreadId): Promise<void>;
}
