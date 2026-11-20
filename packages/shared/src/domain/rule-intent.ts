import type { AutomationActionType } from './automation-action';
import { forwardSlots } from './rule-intent-forward';
import { intentWords } from './rule-intent-tokens';
import { ACTION_WORDS, CONDITION_PHRASES, SENDER_WORDS, UNCERTAIN } from './rule-intent-words';

export interface RuleIntent {
  readonly actions: ReadonlySet<AutomationActionType>;
  readonly forwardTo: ReadonlySet<string>;
}

const BRACKETED = /<\s*([^\s<>]+@[^\s<>]+?)\s*>/gu;
const ADDRESS = /[^\s<>()[\],;:"'„“”]+@[^\s<>()[\],;:"'„“”]+/gu;
const QUOTED = /„[^“”"]*[“”"]|"[^"]*"|“[^”]*”/gu;
const PLACEHOLDER = /^§(\d+)§$/u;
const CLAUSE_BREAK = /(?<=[,;!?.])|\b(?:ale|but|however|avsak)\b/u;

const fold = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('sk');

const masked = (sentence: string, addresses: string[]): string =>
  sentence
    .replace(BRACKETED, ' $1 ')
    .replace(ADDRESS, (match) => {
      const address = match.replace(/[.!?]+$/u, '');
      addresses.push(address.toLowerCase());
      return ` §${String(addresses.length - 1)}§ ${match.slice(address.length)}`;
    })
    .replace(QUOTED, ' §q§ ');

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
  const addresses: string[] = [];
  const text = fold(masked(sentence, addresses));
  const senders = senderSlots(text);
  const actions = new Set<AutomationActionType>();
  const forwardTo = new Set<string>();
  for (const clause of withoutConditions(text).split(CLAUSE_BREAK)) {
    const tokens = tokensOf(clause);
    if (isUncertain(clause, tokens)) {
      continue;
    }
    const words = intentWords(tokens);
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
  return { actions, forwardTo };
};
