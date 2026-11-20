const QUOTE = /"/g;
const WHITESPACE = /\s+/u;
const SEPARATOR = /[^\p{L}\p{N}]+/u;
const MARKS = /\p{M}/gu;

export type SearchPhrase = readonly string[];

const toWords = (value: string): string[] =>
  value
    .normalize('NFD')
    .replace(MARKS, '')
    .toLowerCase()
    .split(SEPARATOR)
    .filter((word) => word.length > 0);

export const toSearchPhrases = (search: string | null): SearchPhrase[] =>
  (search ?? '')
    .replace(QUOTE, ' ')
    .split(WHITESPACE)
    .map(toWords)
    .filter((phrase) => phrase.length > 0);

const phraseAt = (words: readonly string[], phrase: SearchPhrase, start: number): boolean =>
  phrase.every((token, offset) => {
    const word = words[start + offset] ?? '';
    return offset === phrase.length - 1 ? word.startsWith(token) : word === token;
  });

const containsPhrase = (value: string | null, phrase: SearchPhrase): boolean => {
  const words = toWords(value ?? '');
  return words.some((_word, start) => phraseAt(words, phrase, start));
};

export const matchesEveryPhrase = (
  fields: readonly (string | null)[],
  phrases: readonly SearchPhrase[],
): boolean => phrases.every((phrase) => fields.some((field) => containsPhrase(field, phrase)));
