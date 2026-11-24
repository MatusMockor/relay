import type { Page, ThreadFolderQuery } from '@relay/engine';
import {
  type ThreadActiveTask,
  ThreadActiveTaskSchema,
  type ThreadSummary,
  type UserId,
} from '@relay/shared/domain';
import { and, asc, type Column, desc, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { tasks, threads } from '../../schema';
import {
  decodeRankedCursor,
  encodeRankedCursor,
  type RankedPosition,
} from '../../support/ranked-cursor';
import { NO_TASK_RANK, taskPriorityRankSql } from '../tasks/task-priority-rank';
import { folderQueryConditions } from './folder-query-conditions';
import { toThreadSummary } from './thread.mapper';
import { threadSelection } from './thread-selection';

const ofActiveTask = (value: Column | SQL) => sql`(
  select ${value} from ${tasks}
  where ${tasks.threadId} = ${threads.id} and ${tasks.state} <> 'done'
  order by ${taskPriorityRankSql} asc, ${tasks.updatedAt} desc, ${tasks.id} desc
  limit 1
)`;

const activeTaskRank = sql<number>`coalesce(${ofActiveTask(taskPriorityRankSql)}, ${sql.raw(
  String(NO_TASK_RANK),
)})`.mapWith(Number);

const taskThreadSelection = {
  ...threadSelection,
  activeTaskId: sql<string | null>`${ofActiveTask(tasks.id)}`,
  activeTaskPriority: sql<string | null>`${ofActiveTask(tasks.priority)}`,
  activeTaskRank,
};

const afterTaskThread = (position: RankedPosition | null): SQL | undefined => {
  if (position === null) {
    return undefined;
  }
  return sql`(${activeTaskRank} > ${position.rank} or (${activeTaskRank} = ${position.rank} and (${threads.lastMessageAt}, ${threads.id}) < (${position.t}::timestamptz, ${position.id})))`;
};

const toActiveTask = (id: string | null, priority: string | null): ThreadActiveTask | null =>
  id === null || priority === null ? null : ThreadActiveTaskSchema.parse({ id, priority });

export const ordersByActiveTask = (query: ThreadFolderQuery): boolean =>
  query.view === 'tasks' && query.everywhere !== true;

export const queryTaskFolder = async (
  db: DbExecutor,
  userId: UserId,
  query: ThreadFolderQuery,
): Promise<Page<ThreadSummary>> => {
  const position = decodeRankedCursor(query.cursor);
  const rows = await db
    .select(taskThreadSelection)
    .from(threads)
    .where(and(folderQueryConditions(userId, query, null), afterTaskThread(position)))
    .orderBy(asc(activeTaskRank), desc(threads.lastMessageAt), desc(threads.id))
    .limit(query.limit + 1);
  const visible = rows.slice(0, query.limit);
  const last = visible.at(-1);
  return {
    items: visible.map((row) => ({
      ...toThreadSummary(row),
      activeTask: toActiveTask(row.activeTaskId, row.activeTaskPriority),
    })),
    nextCursor:
      rows.length <= query.limit || last === undefined
        ? null
        : encodeRankedCursor({
            rank: last.activeTaskRank,
            t: last.lastMessageAt.toISOString(),
            id: last.id,
          }),
  };
};
