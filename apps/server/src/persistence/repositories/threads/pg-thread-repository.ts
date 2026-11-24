import {
  ConflictError,
  type Page,
  type ThreadFolderQuery,
  type ThreadRepository,
  type ThreadStateChange,
} from '@relay/engine';
import type { AccountId, ThreadId, ThreadSummary, UserId } from '@relay/shared/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { threads } from '../../schema';
import { findAccountOwner } from '../../support/account-owner';
import { decodeCursor, pageOf } from '../../support/cursor';
import { toDateOrNull } from '../../support/timestamps';
import { folderQueryConditions } from './folder-query-conditions';
import { toThreadInsert, toThreadSummary } from './thread.mapper';
import { threadSelection } from './thread-selection';
import { ordersByActiveTask, queryTaskFolder } from './thread-task-folder';
import { replaceThreadSplits } from './thread-splits-writer';

export class PgThreadRepository implements ThreadRepository {
  constructor(private readonly db: DbExecutor) {}

  async queryFolder(userId: UserId, query: ThreadFolderQuery): Promise<Page<ThreadSummary>> {
    if (ordersByActiveTask(query)) {
      return queryTaskFolder(this.db, userId, query);
    }
    const cursor = decodeCursor(query.cursor);
    const rows = await this.db
      .select(threadSelection)
      .from(threads)
      .where(folderQueryConditions(userId, query, cursor))
      .orderBy(desc(threads.lastMessageAt), desc(threads.id))
      .limit(query.limit + 1);
    return pageOf(rows.map(toThreadSummary), query.limit, (thread) => ({
      t: thread.lastMessageAt,
      id: thread.id,
    }));
  }

  async findById(userId: UserId, threadId: ThreadId): Promise<ThreadSummary | null> {
    const [row] = await this.db
      .select(threadSelection)
      .from(threads)
      .where(and(eq(threads.userId, userId), eq(threads.id, threadId)));
    return row === undefined ? null : toThreadSummary(row);
  }

  async findByIdForAccount(
    accountId: AccountId,
    threadId: ThreadId,
  ): Promise<ThreadSummary | null> {
    const [row] = await this.db
      .select(threadSelection)
      .from(threads)
      .where(and(eq(threads.accountId, accountId), eq(threads.id, threadId)));
    return row === undefined ? null : toThreadSummary(row);
  }

  async lockForUpdate(accountId: AccountId, threadId: ThreadId): Promise<ThreadSummary | null> {
    const locked = await this.db
      .select({ id: threads.id })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), eq(threads.id, threadId)))
      .for('update');
    if (locked.length === 0) {
      return null;
    }
    return this.findByIdForAccount(accountId, threadId);
  }

  async upsert(thread: ThreadSummary): Promise<ThreadSummary> {
    return this.db.transaction(async (tx) => {
      const userId = await findAccountOwner(tx, thread.accountId);
      const { id: _id, userId: _userId, ...changes } = toThreadInsert(userId, thread);
      const written = await tx
        .insert(threads)
        .values({ ...changes, id: thread.id, userId })
        .onConflictDoUpdate({
          target: threads.id,
          set: changes,
          setWhere: eq(threads.userId, userId),
        })
        .returning({ id: threads.id });
      if (written.length === 0) {
        throw new ConflictError(`Thread ${thread.id} belongs to another user`);
      }
      await replaceThreadSplits(tx, userId, thread.id, thread.splitIds);
      const stored = await new PgThreadRepository(tx).findById(userId, thread.id);
      return stored ?? thread;
    });
  }

  async updateState(
    userId: UserId,
    threadId: ThreadId,
    change: ThreadStateChange,
  ): Promise<ThreadSummary | null> {
    const rows = await this.db
      .update(threads)
      .set({ ...change, remindAt: toDateOrNull(change.remindAt) })
      .where(and(eq(threads.userId, userId), eq(threads.id, threadId)))
      .returning({ id: threads.id });
    if (rows.length === 0) {
      return null;
    }
    return this.findById(userId, threadId);
  }

  setHasDraft(
    userId: UserId,
    threadId: ThreadId,
    _hasDraft: boolean,
  ): Promise<ThreadSummary | null> {
    return this.findById(userId, threadId);
  }

  async setAiOneLiner(threadId: ThreadId, oneLiner: string | null): Promise<void> {
    await this.db.update(threads).set({ aiOneLiner: oneLiner }).where(eq(threads.id, threadId));
  }

  async delete(threadId: ThreadId): Promise<void> {
    await this.db.delete(threads).where(eq(threads.id, threadId));
  }
}
