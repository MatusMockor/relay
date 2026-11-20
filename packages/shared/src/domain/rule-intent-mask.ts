import {
  ACTION_WORDS,
  CONJUNCTIONS,
  DESTINATION_INTROS,
  NEGATIONS,
  SENDER_WORDS,
  SEQUENCE_JOINTS,
  UNCERTAIN,
} from './rule-intent-words';

const NOT_NAMES: readonly ReadonlySet<string>[] = [
  SENDER_WORDS,
  DESTINATION_INTROS,
  CONJUNCTIONS,
  NEGATIONS,
  UNCERTAIN,
  SEQUENCE_JOINTS,
];

export interface MaskedSentence {
  readonly text: string;
  readonly addresses: readonly string[];
  readonly quotes: readonly string[];
}

const DISPLAYED = /((?:[^\s<>,;:]+\s+){1,3})?<\s*([^\s<>]+@[^\s<>]+?)\s*>/gu;
const ADDRESS = /[^\s<>()[\],;:"'„“”]+@[^\s<>()[\],;:"'„“”]+/gu;
const QUOTED = /„[^“”"]*[“”"]|"[^"]*"|“[^”]*”/gu;
const QUOTE_SLOT = /^§q(\d+)§$/u;

export const fold = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’‘ʼ]/gu, "'").toLocaleLowerCase('sk');

const isNameWord = (word: string): boolean => {
  const plain = fold(word).replace(/[^\p{L}\p{N}'-]/gu, '');
  return (
    plain !== '' &&
    !/[@§]/u.test(word) &&
    !NOT_NAMES.some((words) => words.has(plain)) &&
    !ACTION_WORDS.some(([, words]) => words.test(plain))
  );
};

const withoutDisplayName = (before: string | undefined, address: string): string => {
  const words = (before ?? '')
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== '');
  const kept = [...words];
  while (kept.length > 0 && isNameWord(kept.at(-1) ?? '')) {
    kept.pop();
  }
  return ` ${kept.join(' ')} ${address} `;
};

export const maskSentence = (sentence: string): MaskedSentence => {
  const addresses: string[] = [];
  const quotes: string[] = [];
  const text = sentence
    .replace(DISPLAYED, (_whole: string, before: string | undefined, address: string) =>
      withoutDisplayName(before, address),
    )
    .replace(ADDRESS, (match) => {
      const address = match.replace(/[.!?]+$/u, '');
      addresses.push(address.toLowerCase());
      return ` §${String(addresses.length - 1)}§ ${match.slice(address.length)}`;
    })
    .replace(QUOTED, (match) => {
      quotes.push(fold(match.slice(1, -1)));
      return ` §q${String(quotes.length - 1)}§ `;
    });
  return { text: fold(text), addresses, quotes };
};

export const isQuoteSlot = (token: string): boolean => QUOTE_SLOT.test(token);

export const unquoted = (token: string, quotes: readonly string[]): string => {
  const slot = QUOTE_SLOT.exec(token);
  return slot === null ? token : (quotes[Number(slot[1])] ?? '');
};
