import { type SQL, sql } from 'drizzle-orm';
import { messages } from '../../schema';
import { prefixTsQuery } from './search-query';

const senderVector = sql`to_tsvector('simple', relay_search_text(
  coalesce(${messages.from}->>'name', '') || ' ' || coalesce(${messages.from}->>'email', '')
))`;

export const senderSearchMatch = (terms: readonly string[]): SQL =>
  sql`${messages.searchVector} @@ ${prefixTsQuery(terms, 'B')} and ${senderVector} @@ ${prefixTsQuery(terms)}`;
