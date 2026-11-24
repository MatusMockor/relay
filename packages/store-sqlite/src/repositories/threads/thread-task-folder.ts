import type { Page, ThreadFolderQuery } from '@relay/engine';
import type { ThreadSummary, UserId } from '@relay/shared/domain';
import { and, asc, desc, eq, getTableColumns, gt, lt, or, type SQL } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { toThreadSummary } from '../../mappers/thread-mapper';
import { type RankTimeIdPosition, rankTimeIdCursor } from '../../pagination/rank-time-id-cursor';
import { toPage } from '../../pagination/to-page';
import { threads } from '../../schema';
import { activeTaskColumns, activeTaskRankSql, toActiveTask } from './active-task-columns';
import { threadFolderCondition } from './thread-folder-condition';
import { threadFolderPlanOf } from './thread-folder-plan';
import { readThreadSplits } from './thread-split-reader';

export const ordersByActiveTask = (query: ThreadFolderQuery): boolean =>
  query.view === 'tasks' && query.everywhere !== true;

const afterTaskThread = (position: RankTimeIdPosition | null): SQL | undefined => {
  if (position === null) {
    return undefined;
  }
  return or(
    gt(activeTaskRankSql, position.rank),
    and(
      eq(activeTaskRankSql, position.rank),
      or(
        lt(threads.lastMessageTs, position.ts),
        and(eq(threads.lastMessageTs, position.ts), lt(threads.id, position.id)),
      ),
    ),
  );
};

export const queryTaskFolder = (
  db: RelayDb,
  userId: UserId,
  query: ThreadFolderQuery,
  limit: number,
): Page<ThreadSummary> => {
  const position = rankTimeIdCursor.decode(query.cursor);
  const rows = db
    .select({ ...getTableColumns(threads), ...activeTaskColumns })
    .from(threads)
    .where(
      and(
        threadFolderCondition(userId, query, null, threadFolderPlanOf(db, query)),
        afterTaskThread(position),
      ),
    )
    .orderBy(asc(activeTaskRankSql), desc(threads.lastMessageTs), desc(threads.id))
    .limit(limit + 1)
    .all();
  const splitsByThread = readThreadSplits(
    db,
    rows.slice(0, limit).map((row) => row.id),
  );
  return toPage(
    rows,
    limit,
    (row) => ({
      ...toThreadSummary(row, splitsByThread.get(row.id) ?? []),
      activeTask: toActiveTask(row),
    }),
    (row) =>
      rankTimeIdCursor.encode({ rank: row.activeTaskRank, ts: row.lastMessageTs, id: row.id }),
  );
};
