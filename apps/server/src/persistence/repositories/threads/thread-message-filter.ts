import type { ThreadFolderQuery } from '@relay/engine';
import { and, type SQL, sql } from 'drizzle-orm';
import { messages, threads } from '../../schema';
import { prefixTsQuery, toSearchTerms } from './search-query';
import { senderSearchMatch } from './sender-search-match';

const hasFileAttachment = sql`${messages.attachments} @> '[{"inline": false}]'::jsonb`;

const searchMatch = (query: ThreadFolderQuery): SQL | undefined => {
  const terms = toSearchTerms(query.search);
  if (terms.length === 0) {
    return undefined;
  }
  if (query.searchField === 'from') {
    return senderSearchMatch(terms);
  }
  const weight = query.searchField === 'subject' ? 'A' : null;
  return sql`${messages.searchVector} @@ ${prefixTsQuery(terms, weight)}`;
};

export const threadMessageFilter = (query: ThreadFolderQuery): SQL | undefined => {
  const matched = and(
    searchMatch(query),
    query.hasAttachment === true ? hasFileAttachment : undefined,
  );
  if (matched === undefined) {
    return undefined;
  }
  return sql`exists(
    select 1 from ${messages}
    where ${messages.threadId} = ${threads.id} and ${matched}
  )`;
};
