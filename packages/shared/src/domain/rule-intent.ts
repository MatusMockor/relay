import type { AutomationActionType } from './automation-action';
import { forwardSlots } from './rule-intent-forward';
import { maskSentence, unquoted } from './rule-intent-mask';
import { intentWords } from './rule-intent-tokens';
import { ACTION_WORDS, CONDITION_PHRASES, SENDER_WORDS, UNCERTAIN } from './rule-intent-words';

export interface RuleIntent {
  readonly actions: ReadonlySet<AutomationActionType>;
  readonly forwardTo: ReadonlySet<string>;
  readonly spoken: string;
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

const wantedIn = (asked: readonly string[]): AutomationActionType[] =>
  ACTION_WORDS.filter(([, words]) => asked.some((token) => words.test(token))).map(
    ([type]) => type,
  );

export const ruleIntent = (sentence: string): RuleIntent => {
  const { text, addresses, quotes } = maskSentence(sentence);
  const senders = senderSlots(text);
  const actions = new Set<AutomationActionType>();
  const forwardTo = new Set<string>();
  const spoken: string[] = [];
  for (const clause of withoutConditions(text).split(CLAUSE_BREAK)) {
    const tokens = tokensOf(clause);
    if (isUncertain(clause, tokens)) {
      continue;
    }
    const words = intentWords(tokens);
    words
      .filter((word) => !word.denied)
      .forEach((word) => spoken.push(unquoted(word.text, quotes)));
    wantedIn(words.filter((word) => word.asked).map((word) => word.text)).forEach((type) =>
      actions.add(type),
    );
    forwardSlots(words, PLACEHOLDER)
      .filter((slot) => !senders.has(slot))
      .forEach((slot) => {
        const address = addresses[Number(PLACEHOLDER.exec(slot)?.[1])];
        if (address !== undefined) {
          forwardTo.add(address);
        }
      });
  }
  return { actions, forwardTo, spoken: spoken.join(' ') };
};
