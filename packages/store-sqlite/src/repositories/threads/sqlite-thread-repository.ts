import type { Page, ThreadFolderQuery, ThreadRepository, ThreadStateChange } from '@relay/engine';
import type { AccountId, ThreadId, ThreadSummary, UserId } from '@relay/shared/domain';
import { and, eq, type SQL } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import type { SqliteExecutor } from '../../executor/sqlite-executor';
import { toThreadRow, toThreadSummary } from '../../mappers/thread-mapper';
import { assertPageLimit } from '../../pagination/page-limit';
import { timeIdCursor } from '../../pagination/time-id-cursor';
import { toPage } from '../../pagination/to-page';
import { messages, type ThreadRow, threadSplits, threads } from '../../schema';
import { accountOwnerOf } from '../account-owner';
import { selectFolderThreads } from './thread-folder-select';
import { ordersByActiveTask, queryTaskFolder } from './thread-task-folder';
import { readThreadSplits } from './thread-split-reader';

export class SqliteThreadRepository implements ThreadRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  queryFolder(userId: UserId, query: ThreadFolderQuery): Promise<Page<ThreadSummary>> {
    return this.executor.execute((db) => {
      const limit = assertPageLimit(query.limit);
      if (ordersByActiveTask(query)) {
        return queryTaskFolder(db, userId, query, limit);
      }
      const position = timeIdCursor.decode(query.cursor);
      const rows = selectFolderThreads(db, userId, query, position, limit + 1).all();
      const splitsByThread = readThreadSplits(
        db,
        rows.slice(0, limit).map((row) => row.id),
      );
      return toPage(
        rows,
        limit,
        (row) => toThreadSummary(row, splitsByThread.get(row.id) ?? []),
        (row) => timeIdCursor.encode({ ts: row.lastMessageTs, id: row.id }),
      );
    });
  }

  findById(userId: UserId, threadId: ThreadId): Promise<ThreadSummary | null> {
    return this.executor.execute((db) =>
      this.findWhere(db, and(eq(threads.userId, userId), eq(threads.id, threadId))),
    );
  }

  findByIdForAccount(accountId: AccountId, threadId: ThreadId): Promise<ThreadSummary | null> {
    return this.executor.execute((db) =>
      this.findWhere(db, and(eq(threads.accountId, accountId), eq(threads.id, threadId))),
    );
  }

  lockForUpdate(accountId: AccountId, threadId: ThreadId): Promise<ThreadSummary | null> {
    return this.findByIdForAccount(accountId, threadId);
  }

  upsert(thread: ThreadSummary): Promise<ThreadSummary> {
    return this.executor.execute((db) => {
      const row = toThreadRow(accountOwnerOf(db, thread.accountId), thread);
      const { id: _id, hasDraft: _hasDraft, ...changes } = row;
      db.insert(threads).values(row).onConflictDoUpdate({ target: threads.id, set: changes }).run();
      db.delete(threadSplits).where(eq(threadSplits.threadId, thread.id)).run();
      const splitIds = [...new Set(thread.splitIds)];
      if (splitIds.length > 0) {
        db.insert(threadSplits)
          .values(splitIds.map((splitId) => ({ threadId: thread.id, splitId })))
          .run();
      }
      return this.findWhere(db, eq(threads.id, thread.id)) ?? thread;
    });
  }

  updateState(
    userId: UserId,
    threadId: ThreadId,
    change: ThreadStateChange,
  ): Promise<ThreadSummary | null> {
    return this.executor.execute((db) => {
      const owned = and(eq(threads.userId, userId), eq(threads.id, threadId));
      db.update(threads).set(change).where(owned).run();
      return this.findWhere(db, owned);
    });
  }

  setHasDraft(
    userId: UserId,
    threadId: ThreadId,
    hasDraft: boolean,
  ): Promise<ThreadSummary | null> {
    return this.executor.execute((db) => {
      const owned = and(eq(threads.userId, userId), eq(threads.id, threadId));
      db.update(threads).set({ hasDraft }).where(owned).run();
      return this.findWhere(db, owned);
    });
  }

  setAiOneLiner(threadId: ThreadId, oneLiner: string | null): Promise<void> {
    return this.executor.execute((db) => {
      db.update(threads).set({ aiOneLiner: oneLiner }).where(eq(threads.id, threadId)).run();
    });
  }

  delete(threadId: ThreadId): Promise<void> {
    return this.executor.execute((db) => {
      db.delete(messages).where(eq(messages.threadId, threadId)).run();
      db.delete(threads).where(eq(threads.id, threadId)).run();
    });
  }

  private findWhere(db: RelayDb, condition: SQL | undefined): ThreadSummary | null {
    const row: ThreadRow | undefined = db.select().from(threads).where(condition).get();
    if (row === undefined) {
      return null;
    }
    return toThreadSummary(row, readThreadSplits(db, [row.id]).get(row.id) ?? []);
  }
}
