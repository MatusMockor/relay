import { type Task, TaskSchema } from '@relay/shared/domain';
import type { TaskRow, tasks } from '../schema';
import { toTimestamp } from './timestamp';

export const toTask = (row: TaskRow): Task =>
  TaskSchema.parse({
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    jiraKey: row.jiraKey,
    title: row.title,
    aiWhat: row.aiWhat,
    state: row.state,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const toTaskRow = (task: Task): typeof tasks.$inferInsert => ({
  id: task.id,
  userId: task.userId,
  threadId: task.threadId,
  jiraKey: task.jiraKey,
  title: task.title,
  aiWhat: task.aiWhat,
  state: task.state,
  source: task.source,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  updatedTs: toTimestamp(task.updatedAt),
});
