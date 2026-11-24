import { TASK_PRIORITIES } from '@relay/shared/domain';
import { and, asc, desc, eq, getTableColumns, gt, lt, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CursorCodec } from '../pagination/cursor-codec';
import { tasks } from '../schema';

const rankCases = TASK_PRIORITIES.map(
  (priority, rank) => `when '${priority}' then ${String(rank)}`,
).join(' ');

const priorityRank = sql<number>`(case ${tasks.priority} ${sql.raw(rankCases)} else ${sql.raw(
  String(TASK_PRIORITIES.length),
)} end)`;

const TaskPositionSchema = z.object({
  rank: z.number().int(),
  ts: z.number().int(),
  id: z.string().min(1),
});

type TaskPosition = z.infer<typeof TaskPositionSchema>;

export const taskCursor = new CursorCodec<TaskPosition>(TaskPositionSchema);

export const rankedTaskColumns = { ...getTableColumns(tasks), rank: priorityRank };

export const taskListOrder = [asc(priorityRank), desc(tasks.updatedTs), desc(tasks.id)];

export const afterTaskPosition = (position: TaskPosition | null): SQL | undefined => {
  if (position === null) {
    return undefined;
  }
  return or(
    gt(priorityRank, position.rank),
    and(
      eq(priorityRank, position.rank),
      or(
        lt(tasks.updatedTs, position.ts),
        and(eq(tasks.updatedTs, position.ts), lt(tasks.id, position.id)),
      ),
    ),
  );
};
