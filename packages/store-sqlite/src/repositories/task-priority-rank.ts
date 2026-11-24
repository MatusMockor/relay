import { TASK_PRIORITIES } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { tasks } from '../schema';

const rankCases = TASK_PRIORITIES.map(
  (priority, rank) => `when '${priority}' then ${String(rank)}`,
).join(' ');

export const NO_TASK_RANK = TASK_PRIORITIES.length;

export const taskPriorityRankSql = sql<number>`(case ${tasks.priority} ${sql.raw(rankCases)} else ${sql.raw(
  String(NO_TASK_RANK),
)} end)`;
