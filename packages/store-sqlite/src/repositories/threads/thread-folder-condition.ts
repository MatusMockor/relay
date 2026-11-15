import type { ThreadFolderQuery } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import { and, eq, lt, or, type SQL, sql } from 'drizzle-orm';
import type { TimeIdPosition } from '../../pagination/time-id-cursor';
import { messages, threadSplits, threads } from '../../schema';
import { folderViewCondition } from './folder-view-condition';
import { toFtsMatchExpression } from './fts-match-expression';

const splitCondition = (splitId: string | null): SQL | undefined =>
  splitId === null
    ? undefined
    : sql`exists (select 1 from ${threadSplits} where ${threadSplits.threadId} = ${threads.id} and ${threadSplits.splitId} = ${splitId})`;

const labelCondition = (labelId: string | null): SQL | undefined =>
  labelId === null
    ? undefined
    : sql`exists (select 1 from json_each(${threads.labelIds}) where value = ${labelId})`;

const searchCondition = (userId: UserId, search: string | null): SQL | undefined => {
  const match = toFtsMatchExpression(search);
  if (match === null) {
    return undefined;
  }
  return sql`${threads.id} in (select ${messages.threadId} from messages_fts inner join ${messages} on ${messages.seq} = messages_fts.rowid where messages_fts match ${match} and ${messages.userId} = ${userId})`;
};

const afterCursor = (position: TimeIdPosition | null): SQL | undefined =>
  position === null
    ? undefined
    : or(
        lt(threads.lastMessageTs, position.ts),
        and(eq(threads.lastMessageTs, position.ts), lt(threads.id, position.id)),
      );

export const threadFolderCondition = (
  userId: UserId,
  query: ThreadFolderQuery,
  position: TimeIdPosition | null,
): SQL | undefined =>
  and(
    eq(threads.userId, userId),
    query.accountId === null ? undefined : eq(threads.accountId, query.accountId),
    folderViewCondition(query.view, query.splitId !== null),
    splitCondition(query.splitId),
    labelCondition(query.labelId),
    searchCondition(userId, query.search),
    afterCursor(position),
  );
