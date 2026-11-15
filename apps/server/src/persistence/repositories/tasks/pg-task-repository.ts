import {
  ConflictError,
  type Page,
  type TaskChanges,
  type TaskQuery,
  type TaskRepository,
} from '@relay/engine';
import type { JiraKey, Task, TaskId, ThreadId, UserId } from '@relay/shared/domain';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { tasks } from '../../schema';
import { isUniqueViolation } from '../../support/postgres-errors';
import { decodeCursor, pageOf } from '../../support/cursor';
import { assertOwned } from '../../support/ownership';
import { toDate } from '../../support/timestamps';
import { toTask, toTaskInsert } from './task.mapper';

export class PgTaskRepository implements TaskRepository {
  constructor(private readonly db: DbExecutor) {}

  async list(userId: UserId, query: TaskQuery): Promise<Page<Task>> {
    const cursor = decodeCursor(query.cursor);
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          query.state === null ? undefined : eq(tasks.state, query.state),
          cursor === null
            ? undefined
            : sql`(${tasks.updatedAt}, ${tasks.id}) < (${cursor.t}::timestamptz, ${cursor.id})`,
        ),
      )
      .orderBy(desc(tasks.updatedAt), desc(tasks.id))
      .limit(query.limit + 1);
    return pageOf(rows.map(toTask), query.limit, (task) => ({ t: task.updatedAt, id: task.id }));
  }

  async findById(userId: UserId, taskId: TaskId): Promise<Task | null> {
    const [row] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId)));
    return row === undefined ? null : toTask(row);
  }

  async findByJiraKey(userId: UserId, jiraKey: JiraKey): Promise<Task | null> {
    const [row] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.jiraKey, jiraKey)));
    return row === undefined ? null : toTask(row);
  }

  async findByThread(userId: UserId, threadId: ThreadId): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.threadId, threadId)))
      .orderBy(asc(tasks.createdAt), asc(tasks.id));
    return rows.map(toTask);
  }

  async upsert(task: Task): Promise<Task> {
    const { id: _id, userId: _userId, createdAt: _createdAt, ...changes } = toTaskInsert(task);
    try {
      return await this.db.transaction(async (tx) => {
        await assertOwned(tx, 'Thread', task.userId, task.threadId);
        const [row] = await tx
          .insert(tasks)
          .values(toTaskInsert(task))
          .onConflictDoUpdate({
            target: tasks.id,
            set: changes,
            setWhere: eq(tasks.userId, task.userId),
          })
          .returning();
        if (row === undefined) {
          throw new ConflictError(`Task ${task.id} belongs to another user`);
        }
        return toTask(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`Task for ${task.jiraKey ?? task.id} already exists`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  async update(userId: UserId, taskId: TaskId, changes: TaskChanges): Promise<Task | null> {
    const [row] = await this.db
      .update(tasks)
      .set({ ...changes, updatedAt: toDate(changes.updatedAt) })
      .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId)))
      .returning();
    return row === undefined ? null : toTask(row);
  }

  async delete(userId: UserId, taskId: TaskId): Promise<boolean> {
    const rows = await this.db
      .delete(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId)))
      .returning({ id: tasks.id });
    return rows.length > 0;
  }
}
