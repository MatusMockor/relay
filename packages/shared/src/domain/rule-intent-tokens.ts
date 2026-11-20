import {
  ARTICLES,
  NAME_ENDS,
  NEGATION_ENDS,
  NOUN_NEGATIONS,
  TARGET_WORDS,
  VERB_NEGATIONS,
} from './rule-intent-words';

export interface IntentWord {
  readonly text: string;
  readonly asked: boolean;
  readonly denied: boolean;
}

interface Scope {
  negated: boolean;
  denyNext: boolean;
  naming: boolean;
}

const isMarker = (scope: Scope, token: string): boolean => {
  if (NEGATION_ENDS.has(token)) {
    scope.negated = false;
    scope.denyNext = false;
  }
  if (NAME_ENDS.has(token)) {
    scope.naming = false;
    return true;
  }
  if (VERB_NEGATIONS.has(token)) {
    scope.negated = true;
    return true;
  }
  if (NOUN_NEGATIONS.has(token)) {
    scope.denyNext = true;
    return true;
  }
  return scope.denyNext && ARTICLES.has(token);
};

const classified = (scope: Scope, token: string): IntentWord => {
  const denied = scope.negated || scope.denyNext;
  const data = scope.naming;
  scope.denyNext = false;
  scope.naming = data || TARGET_WORDS.test(token);
  return { text: token, asked: !denied && !data, denied };
};

export const intentWords = (tokens: readonly string[]): IntentWord[] => {
  const scope: Scope = { negated: false, denyNext: false, naming: false };
  return tokens.map((token) =>
    isMarker(scope, token) ? { text: token, asked: false, denied: true } : classified(scope, token),
  );
};
