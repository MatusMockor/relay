import type { JiraKey, Task, TaskId, ThreadId, UserId } from '@relay/shared/domain';
import type { Page, TaskQuery, TaskRepository, TaskChanges } from '../../../src';
import { type MemoryDatabase, offsetPage } from './memory-database';

export class MemoryTaskRepository implements TaskRepository {
  failUpsert: string | null = null;

  constructor(private readonly db: MemoryDatabase) {}

  list(userId: UserId, query: TaskQuery): Promise<Page<Task>> {
    const tasks = this.byUser(userId)
      .filter((task) => query.state === null || task.state === query.state)
      .sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id),
      );
    return Promise.resolve(offsetPage(tasks, query.cursor, query.limit));
  }

  findById(userId: UserId, taskId: TaskId): Promise<Task | null> {
    const task = this.db.tables.tasks.get(taskId);
    return Promise.resolve(task?.userId === userId ? task : null);
  }

  findByJiraKey(userId: UserId, jiraKey: JiraKey): Promise<Task | null> {
    return Promise.resolve(this.byUser(userId).find((task) => task.jiraKey === jiraKey) ?? null);
  }

  findByThread(userId: UserId, threadId: ThreadId): Promise<Task[]> {
    return Promise.resolve(this.byUser(userId).filter((task) => task.threadId === threadId));
  }

  upsert(task: Task): Promise<Task> {
    if (this.failUpsert !== null) {
      return Promise.reject(new Error(this.failUpsert));
    }
    this.db.tables.tasks.set(task.id, task);
    return Promise.resolve(task);
  }

  update(userId: UserId, taskId: TaskId, changes: TaskChanges): Promise<Task | null> {
    const task = this.db.tables.tasks.get(taskId);
    if (task?.userId !== userId) {
      return Promise.resolve(null);
    }
    const updated: Task = { ...task, ...changes };
    this.db.tables.tasks.set(taskId, updated);
    return Promise.resolve(updated);
  }

  delete(userId: UserId, taskId: TaskId): Promise<boolean> {
    if (this.db.tables.tasks.get(taskId)?.userId !== userId) {
      return Promise.resolve(false);
    }
    return Promise.resolve(this.db.tables.tasks.delete(taskId));
  }

  private byUser(userId: UserId): Task[] {
    return [...this.db.tables.tasks.values()].filter((task) => task.userId === userId);
  }
}
