import {
  ARTICLES,
  NAME_ENDS,
  NOUN_NEGATIONS,
  SCOPE_ENDS,
  TARGET_WORDS,
  VERB_NEGATIONS,
} from './rule-intent-words';

interface Scope {
  negated: boolean;
  denyNext: boolean;
  naming: boolean;
}

const opensScope = (scope: Scope, token: string): boolean => {
  if (SCOPE_ENDS.has(token)) {
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

const isRequested = (scope: Scope, token: string): boolean => {
  const denied = scope.negated || scope.denyNext;
  scope.denyNext = false;
  const target = TARGET_WORDS.test(token);
  if (scope.naming && !target) {
    return false;
  }
  scope.naming = scope.naming || target;
  return !denied;
};

export const requestedTokens = (tokens: readonly string[]): string[] => {
  const scope: Scope = { negated: false, denyNext: false, naming: false };
  return tokens.filter((token) => !opensScope(scope, token) && isRequested(scope, token));
};
