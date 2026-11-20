import { type SQL, sql } from 'drizzle-orm';

const TERM_SEPARATOR = /[^\p{L}\p{M}\p{N}]+/u;
const MAX_TERMS = 16;

export const toSearchTerms = (search: string | null): string[] => {
  if (search === null) {
    return [];
  }
  return search
    .normalize('NFC')
    .toLowerCase()
    .split(TERM_SEPARATOR)
    .filter((term) => term.length > 0)
    .slice(0, MAX_TERMS);
};

export type SearchWeight = 'A' | 'B';

export const prefixTsQuery = (
  terms: readonly string[],
  weight: SearchWeight | null = null,
): SQL => {
  const values = sql.join(
    terms.map((term) => sql`${term}`),
    sql`, `,
  );
  return sql`to_tsquery('simple', (
    select string_agg(
      '''' || replace(replace(relay_search_text(term), '\\', '\\\\'), '''', '''''') || ''':*' || ${weight ?? ''},
      ' & '
    )
    from unnest(array[${values}]::text[]) as term
  ))`;
};
