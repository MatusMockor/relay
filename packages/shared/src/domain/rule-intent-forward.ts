import type { IntentPhrase } from './rule-intent-phrases';
import { DESTINATION_INTROS } from './rule-intent-words';

export const destinationOf = (
  phrase: IntentPhrase,
  isRecipient: (token: string) => boolean,
): string | null => {
  const candidates = phrase.words.flatMap((word, index) =>
    !word.denied && isRecipient(word.text) ? [index] : [],
  );
  const [only] = candidates;
  if (only === undefined || candidates.length > 1) {
    return null;
  }
  const intro = phrase.words[only - 1]?.text ?? '';
  return DESTINATION_INTROS.has(intro) ? (phrase.words[only]?.text ?? null) : null;
};
