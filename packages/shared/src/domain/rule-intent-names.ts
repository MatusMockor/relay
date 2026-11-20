import { isQuoteSlot, unquoted } from './rule-intent-mask';
import { actionTypeOf, type PhraseWord } from './rule-intent-phrases';
import { NAME_FILLERS, NAMING_ACTIONS } from './rule-intent-words';

const isFiller = (token: string): boolean => {
  const type = actionTypeOf(token);
  return NAME_FILLERS.has(token) || (type !== null && NAMING_ACTIONS.has(type));
};

export const nameOf = (words: readonly PhraseWord[], quotes: readonly string[]): string => {
  const quoted = words.find((word) => isQuoteSlot(word.text));
  if (quoted !== undefined) {
    return unquoted(quoted.text, quotes);
  }
  const texts = words.map((word) => word.text);
  const first = texts.findIndex((token) => !isFiller(token));
  if (first === -1) {
    const last = texts.at(-1) ?? '';
    return NAME_FILLERS.has(last) ? '' : last;
  }
  const last = texts.findLastIndex((token) => !isFiller(token));
  return texts.slice(first, last + 1).join(' ');
};
