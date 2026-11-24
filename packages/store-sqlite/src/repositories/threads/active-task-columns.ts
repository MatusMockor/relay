import { type ThreadActiveTask, ThreadActiveTaskSchema } from '@relay/shared/domain';
import { type Column, type SQL, sql } from 'drizzle-orm';
import { tasks, threads } from '../../schema';
import { NO_TASK_RANK, taskPriorityRankSql } from '../task-priority-rank';

const ofActiveTask = (value: Column | SQL) =>
  sql`(select ${value} from ${tasks} where ${tasks.threadId} = ${threads.id} and ${tasks.userId} = ${threads.userId} and ${tasks.state} <> 'done' order by ${taskPriorityRankSql} asc, ${tasks.updatedTs} desc, ${tasks.id} desc limit 1)`;

export const activeTaskRankSql = sql<number>`coalesce(${ofActiveTask(taskPriorityRankSql)}, ${sql.raw(
  String(NO_TASK_RANK),
)})`;

export const activeTaskColumns = {
  activeTaskId: sql<string | null>`${ofActiveTask(tasks.id)}`,
  activeTaskPriority: sql<string | null>`${ofActiveTask(tasks.priority)}`,
  activeTaskRank: activeTaskRankSql,
};

interface ActiveTaskRow {
  readonly activeTaskId: string | null;
  readonly activeTaskPriority: string | null;
}

export const toActiveTask = (row: ActiveTaskRow): ThreadActiveTask | null => {
  if (row.activeTaskId === null || row.activeTaskPriority === null) {
    return null;
  }
  return ThreadActiveTaskSchema.parse({ id: row.activeTaskId, priority: row.activeTaskPriority });
};
