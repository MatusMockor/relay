import { ValidationError } from '@relay/engine';
import { TASK_PRIORITIES } from '@relay/shared/domain';
import { asc, desc, getTableColumns, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { tasks } from '../../schema';

const rankCases = TASK_PRIORITIES.map(
  (priority, rank) => `when '${priority}' then ${String(rank)}`,
).join(' ');

const priorityRank = sql<number>`(case ${tasks.priority} ${sql.raw(rankCases)} else ${sql.raw(
  String(TASK_PRIORITIES.length),
)} end)`.mapWith(Number);

const TaskPositionSchema = z.object({
  rank: z.number().int(),
  t: z.iso.datetime({ offset: true }),
  id: z.string().min(1),
});

export type TaskPosition = z.infer<typeof TaskPositionSchema>;

export const rankedTaskColumns = { ...getTableColumns(tasks), rank: priorityRank };

export const taskListOrder = [asc(priorityRank), desc(tasks.updatedAt), desc(tasks.id)];

export const encodeTaskCursor = (position: TaskPosition): string =>
  Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

export const decodeTaskCursor = (cursor: string | null): TaskPosition | null => {
  if (cursor === null) {
    return null;
  }
  const result = TaskPositionSchema.safeParse(parseJson(cursor));
  if (!result.success) {
    throw new ValidationError('Invalid pagination cursor');
  }
  return result.data;
};

export const afterTaskPosition = (position: TaskPosition | null): SQL | undefined => {
  if (position === null) {
    return undefined;
  }
  return sql`(${priorityRank} > ${position.rank} or (${priorityRank} = ${position.rank} and (${tasks.updatedAt}, ${tasks.id}) < (${position.t}::timestamptz, ${position.id})))`;
};
