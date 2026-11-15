const TERM_SEPARATOR = /[^\p{L}\p{M}\p{N}]+/u;
const NON_WORD = /[^\p{L}\p{N}]+/gu;
const MAX_TERMS = 16;

export const toPrefixTsQuery = (search: string | null): string | null => {
  if (search === null) {
    return null;
  }
  const terms = search
    .normalize('NFC')
    .toLowerCase()
    .split(TERM_SEPARATOR)
    .map((term) => term.replace(NON_WORD, ''))
    .filter((term) => term.length > 0)
    .slice(0, MAX_TERMS);
  if (terms.length === 0) {
    return null;
  }
  return terms.map((term) => `${term}:*`).join(' & ');
};
