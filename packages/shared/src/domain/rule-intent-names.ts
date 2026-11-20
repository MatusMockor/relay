import { isQuoteSlot, unquoted } from './rule-intent-mask';
import { actionTypeOf, type PhraseWord } from './rule-intent-phrases';
import { NAME_FILLERS, NAMING_ACTIONS } from './rule-intent-words';
import type { SpokenName } from './rule-target-match';

const isFiller = (token: string): boolean => {
  const type = actionTypeOf(token);
  return NAME_FILLERS.has(token) || (type !== null && NAMING_ACTIONS.has(type));
};

export const nameOf = (words: readonly PhraseWord[], quotes: readonly string[]): SpokenName => {
  const quoted = words.find((word) => isQuoteSlot(word.text));
  if (quoted !== undefined) {
    return { text: unquoted(quoted.text, quotes), quoted: true };
  }
  const texts = words.map((word) => word.text);
  const first = texts.findIndex((token) => !isFiller(token));
  if (first === -1) {
    const last = texts.at(-1) ?? '';
    return { text: NAME_FILLERS.has(last) ? '' : last, quoted: false };
  }
  const last = texts.findLastIndex((token) => !isFiller(token));
  return { text: texts.slice(first, last + 1).join(' '), quoted: false };
};
