import { type SQL, sql } from 'drizzle-orm';
import { LOSER_IDS } from './merge-temp-tables';

const EACH = '[*]';

const jsonPathOf = (segment: string): string => (segment.startsWith('$') ? segment : `$${segment}`);

const eachAlias = (index: number): SQL => sql.raw(`e${String(index)}`);

const nestedPredicate = (column: SQL, segments: readonly string[]): SQL => {
  const sources = segments.slice(0, -1).map((segment, index) => {
    const input = index === 0 ? column : sql`${eachAlias(index - 1)}.value`;
    return sql`json_each(${input}, ${jsonPathOf(segment)}) ${eachAlias(index)}`;
  });
  const last = sql`${eachAlias(sources.length - 1)}.value`;
  const tail = segments.at(-1) ?? '';
  const value = tail === '' ? last : sql`json_extract(${last}, ${jsonPathOf(tail)})`;
  return sql`exists (select 1 from ${sql.join(sources, sql`, `)} where ${value} in ${LOSER_IDS})`;
};

export const jsonPathHoldsLoser = (column: SQL, path: string): SQL => {
  const segments = path.split(EACH);
  if (segments.length === 1) {
    return sql`json_extract(${column}, ${path}) in ${LOSER_IDS}`;
  }
  return nestedPredicate(column, segments);
};
