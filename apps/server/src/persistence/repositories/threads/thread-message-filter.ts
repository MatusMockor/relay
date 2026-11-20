import type { ThreadFolderQuery } from '@relay/engine';
import type { ThreadSearchField } from '@relay/shared/domain';
import { and, type SQL, sql } from 'drizzle-orm';
import { messages, threads } from '../../schema';
import { prefixTsQuery, type SearchWeight, toSearchTerms } from './search-query';

const FIELD_WEIGHTS: Readonly<Record<ThreadSearchField, SearchWeight>> = {
  from: 'B',
  subject: 'A',
};

const hasFileAttachment = sql`${messages.attachments} @> '[{"inline": false}]'::jsonb`;

const searchMatch = (query: ThreadFolderQuery): SQL | undefined => {
  const terms = toSearchTerms(query.search);
  if (terms.length === 0) {
    return undefined;
  }
  const field = query.searchField ?? null;
  const weight = field === null ? null : FIELD_WEIGHTS[field];
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
