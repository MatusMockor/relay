import type { Page, TaskChanges, TaskQuery, TaskRepository } from '@relay/engine';
import type { JiraKey, Task, TaskId, ThreadId, UserId } from '@relay/shared/domain';
import { and, asc, desc, eq, lt, or } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toTask, toTaskRow } from '../mappers/task-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { assertPageLimit } from '../pagination/page-limit';
import { timeIdCursor } from '../pagination/time-id-cursor';
import { toPage } from '../pagination/to-page';
import { tasks } from '../schema';

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  list(userId: UserId, query: TaskQuery): Promise<Page<Task>> {
    return this.executor.execute((db) => {
      const limit = assertPageLimit(query.limit);
      const position = timeIdCursor.decode(query.cursor);
      const rows = db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            query.state === null ? undefined : eq(tasks.state, query.state),
            position === null
              ? undefined
              : or(
                  lt(tasks.updatedTs, position.ts),
                  and(eq(tasks.updatedTs, position.ts), lt(tasks.id, position.id)),
                ),
          ),
        )
        .orderBy(desc(tasks.updatedTs), desc(tasks.id))
        .limit(limit + 1)
        .all();
      return toPage(rows, limit, toTask, (row) =>
        timeIdCursor.encode({ ts: row.updatedTs, id: row.id }),
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
