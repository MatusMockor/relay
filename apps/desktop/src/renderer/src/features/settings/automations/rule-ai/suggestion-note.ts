import type { RuleSuggestion } from '@relay/shared';

export interface SuggestionNote {
  readonly id: number;
  readonly sentence: string;
  readonly understood: string;
  readonly unmapped: readonly string[];
}

let lastNote = 0;

export const noteOf = (sentence: string, suggestion: RuleSuggestion): SuggestionNote => {
  lastNote += 1;
  return {
    id: lastNote,
    sentence,
    understood: suggestion.understood,
    unmapped: suggestion.unmapped,
  };
};
