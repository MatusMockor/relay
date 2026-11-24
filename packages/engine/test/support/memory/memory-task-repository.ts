import {
  compareTaskPriority,
  type JiraKey,
  type Task,
  type TaskId,
  type ThreadId,
  type UserId,
} from '@relay/shared/domain';
import {
  ConflictError,
  type JiraTaskCreation,
  type Page,
  type TaskChanges,
  type TaskQuery,
  type TaskRepository,
} from '../../../src';
import { type MemoryDatabase, offsetPage } from './memory-database';

export class MemoryTaskRepository implements TaskRepository {
  failUpsert: string | null = null;

  constructor(private readonly db: MemoryDatabase) {}

  list(userId: UserId, query: TaskQuery): Promise<Page<Task>> {
    const tasks = this.byUser(userId)
      .filter((task) => query.state === null || task.state === query.state)
      .filter((task) => query.threadId === undefined || task.threadId === query.threadId)
      .sort(
        (a, b) =>
          compareTaskPriority(a.priority, b.priority) ||
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
          b.id.localeCompare(a.id),
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
    if (this.jiraDuplicate(task) !== undefined) {
      return Promise.reject(new ConflictError('The record conflicts with an existing record'));
    }
    this.db.tables.tasks.set(task.id, task);
    return Promise.resolve(task);
  }

  createOrGetByJiraKey(task: Task & { readonly jiraKey: JiraKey }): Promise<JiraTaskCreation> {
    if (this.failUpsert !== null) {
      return Promise.reject(new Error(this.failUpsert));
    }
    const existing = this.byUser(task.userId).find((stored) => stored.jiraKey === task.jiraKey);
    if (existing !== undefined) {
      return Promise.resolve({ task: existing, created: false });
    }
    if (this.db.tables.tasks.has(task.id)) {
      return Promise.reject(new ConflictError(`Task ${task.id} already exists`));
    }
    this.db.tables.tasks.set(task.id, task);
    return Promise.resolve({ task, created: true });
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

  private jiraDuplicate(task: Task): Task | undefined {
    if (task.jiraKey === null) {
      return undefined;
    }
    return this.byUser(task.userId).find(
      (stored) => stored.jiraKey === task.jiraKey && stored.id !== task.id,
    );
  }

  private byUser(userId: UserId): Task[] {
    return [...this.db.tables.tasks.values()].filter((task) => task.userId === userId);
  }
}
