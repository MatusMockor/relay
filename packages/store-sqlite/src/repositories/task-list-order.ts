import { and, asc, desc, eq, getTableColumns, gt, lt, or, type SQL } from 'drizzle-orm';
import type { RankTimeIdPosition } from '../pagination/rank-time-id-cursor';
import { tasks } from '../schema';
import { taskPriorityRankSql } from './task-priority-rank';

export const rankedTaskColumns = { ...getTableColumns(tasks), rank: taskPriorityRankSql };

export const taskListOrder = [asc(taskPriorityRankSql), desc(tasks.updatedTs), desc(tasks.id)];

export const afterTaskPosition = (position: RankTimeIdPosition | null): SQL | undefined => {
  if (position === null) {
    return undefined;
  }
  return or(
    gt(taskPriorityRankSql, position.rank),
    and(
      eq(taskPriorityRankSql, position.rank),
      or(
        lt(tasks.updatedTs, position.ts),
        and(eq(tasks.updatedTs, position.ts), lt(tasks.id, position.id)),
      ),
    ),
  );
};
