import type { JiraKey, Task, TaskId, TaskState, ThreadId, UserId } from '@relay/shared/domain';
import type { Page, PageRequest } from '../model/page';

export interface TaskQuery extends PageRequest {
  readonly state: TaskState | null;
}

export interface TaskRepository {
  list(userId: UserId, query: TaskQuery): Promise<Page<Task>>;
  findById(userId: UserId, taskId: TaskId): Promise<Task | null>;
  findByJiraKey(userId: UserId, jiraKey: JiraKey): Promise<Task | null>;
  findByThread(userId: UserId, threadId: ThreadId): Promise<Task[]>;
  upsert(task: Task): Promise<Task>;
  delete(userId: UserId, taskId: TaskId): Promise<boolean>;
}
