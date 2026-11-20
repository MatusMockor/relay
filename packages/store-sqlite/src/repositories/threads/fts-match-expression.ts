import type { ThreadSearchField } from '@relay/shared/domain';

const QUOTE = /"/g;
const WHITESPACE = /\s+/u;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

const FIELD_COLUMNS: Readonly<Record<ThreadSearchField, string>> = {
  from: 'sender',
  subject: 'subject',
};

const columnFilterOf = (field: ThreadSearchField | null): string =>
  field === null ? '' : `${FIELD_COLUMNS[field]} : `;

export const toFtsMatchExpression = (
  search: string | null,
  field: ThreadSearchField | null = null,
): string | null => {
  if (search === null) {
    return null;
  }
  const columnFilter = columnFilterOf(field);
  const terms = search
    .replace(QUOTE, ' ')
    .split(WHITESPACE)
    .filter((term) => WORD_CHARACTER.test(term))
    .map((term) => `${columnFilter}"${term}"*`);
  return terms.length === 0 ? null : terms.join(' ');
};
