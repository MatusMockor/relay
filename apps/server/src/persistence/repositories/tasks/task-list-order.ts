import { asc, desc, getTableColumns, type SQL, sql } from 'drizzle-orm';
import { tasks } from '../../schema';
import type { RankedPosition } from '../../support/ranked-cursor';
import { taskPriorityRankSql } from './task-priority-rank';

export const rankedTaskColumns = { ...getTableColumns(tasks), rank: taskPriorityRankSql };

export const taskListOrder = [asc(taskPriorityRankSql), desc(tasks.updatedAt), desc(tasks.id)];

export const afterTaskPosition = (position: RankedPosition | null): SQL | undefined => {
  if (position === null) {
    return undefined;
  }
  return sql`(${taskPriorityRankSql} > ${position.rank} or (${taskPriorityRankSql} = ${position.rank} and (${tasks.updatedAt}, ${tasks.id}) < (${position.t}::timestamptz, ${position.id})))`;
};
