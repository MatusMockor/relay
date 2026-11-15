import type { AccountId, ThreadId, ThreadSummary, UserId } from '@relay/shared/domain';
import type { Page, ThreadFolderQuery, ThreadRepository, ThreadStateChange } from '../../../src';
import { type MemoryDatabase, offsetPage } from './memory-database';
import { ThreadFolderFilter } from './thread-folder-filter';

export class MemoryThreadRepository implements ThreadRepository {
  failUpsert: string | null = null;
  private readonly filter: ThreadFolderFilter;

  constructor(private readonly db: MemoryDatabase) {
    this.filter = new ThreadFolderFilter(db);
  }

  queryFolder(userId: UserId, query: ThreadFolderQuery): Promise<Page<ThreadSummary>> {
    const matches = [...this.db.tables.threads.values()]
      .filter((thread) => this.filter.matches(userId, thread, query))
      .sort(
        (a, b) =>
          Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt) || b.id.localeCompare(a.id),
      );
    return Promise.resolve(offsetPage(matches, query.cursor, query.limit));
  }

  findById(userId: UserId, threadId: ThreadId): Promise<ThreadSummary | null> {
    const thread = this.db.tables.threads.get(threadId);
    if (thread === undefined || !this.db.ownsAccount(userId, thread.accountId)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(thread);
  }

  findByIdForAccount(accountId: AccountId, threadId: ThreadId): Promise<ThreadSummary | null> {
    const thread = this.db.tables.threads.get(threadId);
    return Promise.resolve(thread?.accountId === accountId ? thread : null);
  }

  upsert(thread: ThreadSummary): Promise<ThreadSummary> {
    if (this.failUpsert !== null) {
      return Promise.reject(new Error(this.failUpsert));
    }
    const stored = this.db.tables.threads.get(thread.id);
    const saved = stored === undefined ? thread : { ...thread, hasDraft: stored.hasDraft };
    this.db.tables.threads.set(thread.id, saved);
    return Promise.resolve(saved);
  }

  setHasDraft(
    userId: UserId,
    threadId: ThreadId,
    hasDraft: boolean,
  ): Promise<ThreadSummary | null> {
    const thread = this.db.tables.threads.get(threadId);
    if (thread === undefined || !this.db.ownsAccount(userId, thread.accountId)) {
      return Promise.resolve(null);
    }
    const updated: ThreadSummary = { ...thread, hasDraft };
    this.db.tables.threads.set(threadId, updated);
    return Promise.resolve(updated);
  }

  updateState(
    userId: UserId,
    threadId: ThreadId,
    change: ThreadStateChange,
  ): Promise<ThreadSummary | null> {
    const thread = this.db.tables.threads.get(threadId);
    if (thread === undefined || !this.db.ownsAccount(userId, thread.accountId)) {
      return Promise.resolve(null);
    }
    const updated: ThreadSummary = { ...thread, state: change.state, remindAt: change.remindAt };
    this.db.tables.threads.set(threadId, updated);
    return Promise.resolve(updated);
  }

  setAiOneLiner(threadId: ThreadId, oneLiner: string | null): Promise<void> {
    const thread = this.db.tables.threads.get(threadId);
    if (thread !== undefined) {
      this.db.tables.threads.set(threadId, { ...thread, aiOneLiner: oneLiner });
    }
    return Promise.resolve();
  }

  delete(threadId: ThreadId): Promise<void> {
    this.db.tables.threads.delete(threadId);
    return Promise.resolve();
  }
}
