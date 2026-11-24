import type { AutomationActionType } from './automation-action';
import { destinationOf } from './rule-intent-forward';
import { maskSentence } from './rule-intent-mask';
import { nameOf } from './rule-intent-names';
import { intentPhrases } from './rule-intent-phrases';
import { CONDITION_PHRASES, SENDER_WORDS, UNCERTAIN } from './rule-intent-words';
import type { SpokenName } from './rule-target-match';

export interface RuleTargetNames {
  readonly addLabel: readonly SpokenName[];
  readonly moveTo: readonly SpokenName[];
}

export interface RuleIntent {
  readonly actions: ReadonlySet<AutomationActionType>;
  readonly forwardTo: ReadonlySet<string>;
  readonly targetNames: RuleTargetNames;
}

const PLACEHOLDER = /^§(\d+)§$/u;
const CLAUSE_BREAK = /(?<=[,;!?.])|\b(?:ale|but|however|avsak)\b/u;

const senderSlots = (text: string): Set<string> => {
  const tokens = text.split(/\s+/u);
  return new Set(
    tokens.filter(
      (token, index) => PLACEHOLDER.test(token) && SENDER_WORDS.has(tokens[index - 1] ?? ''),
    ),
  );
};

const withoutConditions = (text: string): string =>
  CONDITION_PHRASES.reduce((current, phrase) => current.replace(phrase, ' '), text);

const tokensOf = (clause: string): string[] =>
  clause.split(/[\s,;!?.]+/u).filter((token) => token !== '');

const isUncertain = (clause: string, tokens: readonly string[]): boolean =>
  clause.trim().endsWith('?') || tokens.some((token) => UNCERTAIN.has(token));

export const ruleIntent = (sentence: string): RuleIntent => {
  const { text, addresses, quotes } = maskSentence(sentence);
  const senders = senderSlots(text);
  const isRecipient = (token: string) => PLACEHOLDER.test(token) && !senders.has(token);
  const actions = new Set<AutomationActionType>();
  const forwardTo = new Set<string>();
  const targetNames = { addLabel: [] as SpokenName[], moveTo: [] as SpokenName[] };
  for (const clause of withoutConditions(text).split(CLAUSE_BREAK)) {
    const tokens = tokensOf(clause);
    if (isUncertain(clause, tokens)) {
      continue;
    }
    for (const phrase of intentPhrases(tokens).filter((item) => item.asked)) {
      actions.add(phrase.type);
      if (phrase.type === 'addLabel' || phrase.type === 'moveTo') {
        targetNames[phrase.type].push(nameOf(phrase.words, quotes));
      }
      const slot = phrase.type === 'forward' ? destinationOf(phrase, isRecipient) : null;
      const address = slot === null ? undefined : addresses[Number(PLACEHOLDER.exec(slot)?.[1])];
      if (address !== undefined) {
        forwardTo.add(address);
      }
    }
  }
  return { actions, forwardTo, targetNames };
};
