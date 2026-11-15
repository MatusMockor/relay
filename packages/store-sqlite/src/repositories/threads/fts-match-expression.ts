const QUOTE = /"/g;
const WHITESPACE = /\s+/u;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

export const toFtsMatchExpression = (search: string | null): string | null => {
  if (search === null) {
    return null;
  }
  const terms = search
    .replace(QUOTE, ' ')
    .split(WHITESPACE)
    .filter((term) => WORD_CHARACTER.test(term))
    .map((term) => `"${term}"*`);
  return terms.length === 0 ? null : terms.join(' ');
};
