import {
  ConflictError,
  type JiraTaskCreation,
  type Page,
  type TaskChanges,
  type TaskQuery,
  type TaskRepository,
} from '@relay/engine';
import type { JiraKey, Task, TaskId, ThreadId, UserId } from '@relay/shared/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toTask, toTaskRow } from '../mappers/task-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { assertPageLimit } from '../pagination/page-limit';
import { rankTimeIdCursor } from '../pagination/rank-time-id-cursor';
import { toPage } from '../pagination/to-page';
import { tasks } from '../schema';
import { afterTaskPosition, rankedTaskColumns, taskListOrder } from './task-list-order';

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  list(userId: UserId, query: TaskQuery): Promise<Page<Task>> {
    return this.executor.execute((db) => {
      const limit = assertPageLimit(query.limit);
      const rows = db
        .select(rankedTaskColumns)
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            query.state === null ? undefined : eq(tasks.state, query.state),
            query.threadId === undefined ? undefined : eq(tasks.threadId, query.threadId),
            afterTaskPosition(rankTimeIdCursor.decode(query.cursor)),
          ),
        )
        .orderBy(...taskListOrder)
        .limit(limit + 1)
        .all();
      return toPage(rows, limit, toTask, (row) =>
        rankTimeIdCursor.encode({ rank: row.rank, ts: row.updatedTs, id: row.id }),
      );
    });
  }

  findById(userId: UserId, taskId: TaskId): Promise<Task | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId)))
        .get();
      return row === undefined ? null : toTask(row);
    });
  }

  findByJiraKey(userId: UserId, jiraKey: JiraKey): Promise<Task | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.jiraKey, jiraKey)))
        .get();
      return row === undefined ? null : toTask(row);
    });
  }

  findByThread(userId: UserId, threadId: ThreadId): Promise<Task[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.threadId, threadId)))
        .orderBy(asc(tasks.createdAt), asc(tasks.id))
        .all()
        .map(toTask),
    );
  }

  upsert(task: Task): Promise<Task> {
    return this.executor.execute((db) => {
      const row = toTaskRow(task);
      const { id: _id, ...changes } = row;
      db.insert(tasks).values(row).onConflictDoUpdate({ target: tasks.id, set: changes }).run();
      return task;
    });
  }

  createOrGetByJiraKey(task: Task & { readonly jiraKey: JiraKey }): Promise<JiraTaskCreation> {
    return this.executor.execute((db) => {
      const inserted = db.insert(tasks).values(toTaskRow(task)).onConflictDoNothing().run();
      const row = db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, task.userId), eq(tasks.jiraKey, task.jiraKey)))
        .get();
      if (row === undefined) {
        throw new ConflictError(`Task ${task.id} already exists`);
      }
      return { task: toTask(row), created: inserted.changes > 0 };
    });
  }

  update(userId: UserId, taskId: TaskId, changes: TaskChanges): Promise<Task | null> {
    return this.executor.execute((db) => {
      const owned = and(eq(tasks.userId, userId), eq(tasks.id, taskId));
      db.update(tasks)
        .set({ ...changes, updatedTs: toTimestamp(changes.updatedAt) })
        .where(owned)
        .run();
      const row = db.select().from(tasks).where(owned).get();
      return row === undefined ? null : toTask(row);
    });
  }

  delete(userId: UserId, taskId: TaskId): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .delete(tasks)
          .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId)))
          .run().changes > 0,
    );
  }
}
