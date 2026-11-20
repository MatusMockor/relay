import type { ThreadFolderQuery } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { messages, threads } from '../../schema';
import { toFtsMatchExpression } from './fts-match-expression';

const hasFileAttachment = sql`exists (select 1 from json_each(${messages.attachments}) where json_extract(json_each.value, '$.inline') = 0)`;

const anyMessageWith = (condition: SQL): SQL =>
  sql`exists (select 1 from ${messages} where ${messages.threadId} = ${threads.id} and ${condition})`;

export const threadMessageCondition = (
  userId: UserId,
  query: ThreadFolderQuery,
): SQL | undefined => {
  const match = toFtsMatchExpression(query.search, query.searchField ?? null);
  const attachment = query.hasAttachment === true ? hasFileAttachment : undefined;
  if (match === null) {
    return attachment === undefined ? undefined : anyMessageWith(attachment);
  }
  const matched = and(sql`messages_fts match ${match}`, eq(messages.userId, userId), attachment);
  return sql`${threads.id} in (select ${messages.threadId} from messages_fts inner join ${messages} on ${messages.seq} = messages_fts.rowid where ${matched})`;
};
