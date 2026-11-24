import type { Task } from '@relay/shared/domain';
import type { tasks } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type TaskRow = typeof tasks.$inferSelect;
type TaskInsert = typeof tasks.$inferInsert;

export const toTask = (row: TaskRow): Task => ({
  id: row.id,
  userId: row.userId,
  threadId: row.threadId,
  jiraKey: row.jiraKey,
  title: row.title,
  aiWhat: row.aiWhat,
  state: row.state,
  source: row.source,
  priority: row.priority,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const toTaskInsert = (task: Task): TaskInsert => ({
  id: task.id,
  userId: task.userId,
  threadId: task.threadId,
  jiraKey: task.jiraKey,
  title: task.title,
  aiWhat: task.aiWhat,
  state: task.state,
  source: task.source,
  priority: task.priority,
  createdAt: toDate(task.createdAt),
  updatedAt: toDate(task.updatedAt),
});
