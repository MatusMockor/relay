import type { ThreadFolderQuery } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import { and, eq, lt, not, or, type SQL, sql } from 'drizzle-orm';
import type { TimeIdPosition } from '../../pagination/time-id-cursor';
import { splits, threadSplits, threads } from '../../schema';
import { folderViewCondition, hasOpenTask, notHeld } from './folder-view-condition';
import { toFtsMatchExpression } from './fts-match-expression';
import type { ThreadFolderPlan } from './thread-folder-plan';
import { type PlanConditions, planConditionsOf } from './thread-folder-plan-conditions';
import { threadMessageCondition } from './thread-message-condition';

const inSplit = (splitId: string): SQL =>
  sql`exists (select 1 from ${threadSplits} where ${threadSplits.threadId} = ${threads.id} and ${threadSplits.splitId} = ${splitId})`;

const hiddenTaskOfSplit = (splitId: string): SQL =>
  sql`(exists (select 1 from ${splits} where ${splits.id} = ${splitId} and ${splits.hideTasks} = 1) and ${hasOpenTask})`;

const splitCondition = (splitId: string | null): SQL | undefined =>
  splitId === null ? undefined : and(inSplit(splitId), not(hiddenTaskOfSplit(splitId)));

const labelCondition = (labelId: string | null): SQL | undefined =>
  labelId === null
    ? undefined
    : sql`exists (select 1 from json_each(${threads.labelIds}) where value = ${labelId})`;

const folderScopeCondition = (
  query: ThreadFolderQuery,
  conditions: PlanConditions,
): SQL | undefined => {
  if (query.everywhere === true) {
    return notHeld;
  }
  return and(
    folderViewCondition({
      view: query.view,
      splitSelected: query.splitId !== null,
      searching: toFtsMatchExpression(query.search) !== null,
    }),
    splitCondition(query.splitId),
    labelCondition(query.labelId),
    query.mailboxId === null ? undefined : conditions.inMailbox(query.mailboxId),
  );
};

const unreadCondition = (unread: boolean | undefined): SQL | undefined =>
  unread === true ? eq(threads.unread, true) : undefined;

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
  plan: ThreadFolderPlan,
): SQL | undefined => {
  const conditions = planConditionsOf(plan);
  return and(
    conditions.owner(userId, query.accountId),
    folderScopeCondition(query, conditions),
    unreadCondition(query.unread),
    threadMessageCondition(userId, query),
    afterCursor(position),
  );
};
