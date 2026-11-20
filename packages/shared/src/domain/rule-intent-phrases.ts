import type { AutomationActionType } from './automation-action';
import {
  ACTION_WORDS,
  CONJUNCTIONS,
  JOINT_REACH,
  NAMING_ACTIONS,
  NEGATIONS,
  SEQUENCE_JOINTS,
} from './rule-intent-words';

export interface PhraseWord {
  readonly text: string;
  readonly denied: boolean;
}

export interface IntentPhrase {
  readonly type: AutomationActionType;
  readonly asked: boolean;
  readonly words: PhraseWord[];
}

export const actionTypeOf = (token: string): AutomationActionType | null =>
  ACTION_WORDS.find(([, words]) => words.test(token))?.[0] ?? null;

const isJoint = (tokens: readonly string[], index: number): boolean => {
  const token = tokens[index] ?? '';
  if (SEQUENCE_JOINTS.has(token)) {
    return true;
  }
  const ahead = tokens.slice(index + 1, index + 1 + JOINT_REACH);
  return CONJUNCTIONS.has(token) && ahead.some((word) => actionTypeOf(word) !== null);
};

export const intentPhrases = (tokens: readonly string[]): IntentPhrase[] => {
  const phrases: IntentPhrase[] = [];
  let current: IntentPhrase | null = null;
  let negated = false;
  let naming = false;
  for (const [index, token] of tokens.entries()) {
    if (isJoint(tokens, index)) {
      negated = negated && !SEQUENCE_JOINTS.has(token);
      current = null;
      naming = false;
      continue;
    }
    if (naming) {
      current?.words.push({ text: token, denied: false });
      continue;
    }
    if (NEGATIONS.has(token)) {
      negated = true;
      continue;
    }
    const type = actionTypeOf(token);
    if (type === null) {
      current?.words.push({ text: token, denied: negated });
      continue;
    }
    current = { type, asked: !negated, words: [] };
    phrases.push(current);
    naming = NAMING_ACTIONS.has(type);
  }
  return phrases;
};
