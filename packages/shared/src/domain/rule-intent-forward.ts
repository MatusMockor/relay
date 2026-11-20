import type { IntentWord } from './rule-intent-tokens';
import { ACTION_WORDS, DESTINATION_INTROS, FORWARD_WORDS, PHRASE_ENDS } from './rule-intent-words';

const endsPhrase = (word: IntentWord): boolean =>
  PHRASE_ENDS.has(word.text) || ACTION_WORDS.some(([, words]) => words.test(word.text));

const phraseAfter = (words: readonly IntentWord[], start: number): IntentWord[] => {
  const rest = words.slice(start);
  const end = rest.findIndex(endsPhrase);
  return end === -1 ? rest : rest.slice(0, end);
};

const firstIntroduced = (phrase: readonly IntentWord[], slot: RegExp): string[] => {
  const first = phrase.find(
    (word, index) =>
      word.asked && slot.test(word.text) && DESTINATION_INTROS.has(phrase[index - 1]?.text ?? ''),
  );
  return first === undefined ? [] : [first.text];
};

export const forwardSlots = (words: readonly IntentWord[], slot: RegExp): string[] =>
  words.flatMap((word, index) =>
    word.asked && FORWARD_WORDS.test(word.text)
      ? firstIntroduced(phraseAfter(words, index + 1), slot)
      : [],
  );
