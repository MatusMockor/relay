import type { ThreadFolderQuery } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { messageLabels, messages, splits, threadSplits, threads } from '../../schema';
import type { CursorPayload } from '../../support/cursor';
import { folderViewFilter, hasOpenTask } from './folder-view-filters';
import { prefixTsQuery, toSearchTerms } from './search-query';

const splitFilter = (query: ThreadFolderQuery): SQL | undefined => {
  if (query.splitId === null) {
    return undefined;
  }
  return sql`exists(
    select 1 from ${threadSplits}
    where ${threadSplits.threadId} = ${threads.id} and ${threadSplits.splitId} = ${query.splitId}
  ) and not (
    exists(select 1 from ${splits} where ${splits.id} = ${query.splitId} and ${splits.hideTasks})
    and ${hasOpenTask}
  )`;
};

const labelFilter = (query: ThreadFolderQuery): SQL | undefined => {
  if (query.labelId === null) {
    return undefined;
  }
  return sql`exists(
    select 1 from ${messageLabels}
    join ${messages} on ${messages.id} = ${messageLabels.messageId}
    where ${messages.threadId} = ${threads.id} and ${messageLabels.labelId} = ${query.labelId}
  )`;
};

const mailboxFilter = (query: ThreadFolderQuery): SQL | undefined => {
  if (query.mailboxId === null) {
    return undefined;
  }
  return sql`${threads.id} in (
    select ${messages.threadId} from ${messages} where ${messages.mailboxId} = ${query.mailboxId}
  )`;
};

const searchFilter = (query: ThreadFolderQuery): SQL | undefined => {
  const terms = toSearchTerms(query.search);
  if (terms.length === 0) {
    return undefined;
  }
  return sql`exists(
    select 1 from ${messages}
    where ${messages.threadId} = ${threads.id}
      and ${messages.searchVector} @@ ${prefixTsQuery(terms)}
  )`;
};

const cursorFilter = (cursor: CursorPayload | null): SQL | undefined => {
  if (cursor === null) {
    return undefined;
  }
  return sql`(${threads.lastMessageAt}, ${threads.id}) < (${cursor.t}::timestamptz, ${cursor.id})`;
};

export const folderQueryConditions = (
  userId: UserId,
  query: ThreadFolderQuery,
  cursor: CursorPayload | null,
): SQL | undefined =>
  and(
    eq(threads.userId, userId),
    query.accountId === null ? undefined : eq(threads.accountId, query.accountId),
    folderViewFilter({
      view: query.view,
      splitSelected: query.splitId !== null,
      searching: toSearchTerms(query.search).length > 0,
    }),
    splitFilter(query),
    labelFilter(query),
    mailboxFilter(query),
    searchFilter(query),
    cursorFilter(cursor),
  );
