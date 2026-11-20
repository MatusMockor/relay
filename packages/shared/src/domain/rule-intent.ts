import type { AutomationActionType } from './automation-action';
import {
  ACTION_WORDS,
  CONDITION_PHRASES,
  NEGATION_WINDOW,
  NEGATIONS,
  SENDER_WORDS,
  UNCERTAIN,
} from './rule-intent-words';

export interface RuleIntent {
  readonly actions: ReadonlySet<AutomationActionType>;
  readonly forwardTo: ReadonlySet<string>;
}

const ADDRESS = /[^\s<>()[\],;:"'„“”]+@[^\s<>()[\],;:"'„“”]+/gu;
const QUOTED = /„[^“”"]*[“”"]|"[^"]*"|“[^”]*”/gu;
const PLACEHOLDER = /^§(\d+)§$/u;
const CLAUSE_BREAK = /(?<=[,;!?.])|\b(?:ale|but|however|avsak)\b/u;

const fold = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('sk');

const masked = (sentence: string, addresses: string[]): string =>
  sentence
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

const isNegated = (tokens: readonly string[], index: number): boolean =>
  tokens.slice(Math.max(0, index - NEGATION_WINDOW), index).some((token) => NEGATIONS.has(token));

const wantedIn = (tokens: readonly string[]): AutomationActionType[] =>
  ACTION_WORDS.filter(([, words]) =>
    tokens.some((token, index) => words.test(token) && !isNegated(tokens, index)),
  ).map(([type]) => type);

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
    const wanted = wantedIn(tokens);
    wanted.forEach((type) => actions.add(type));
    if (!wanted.includes('forward')) {
      continue;
    }
    tokens
      .filter((token) => PLACEHOLDER.test(token) && !senders.has(token))
      .forEach((token) => {
        const address = addresses[Number(PLACEHOLDER.exec(token)?.[1])];
        if (address !== undefined) {
          forwardTo.add(address);
        }
      });
  }
  return { actions, forwardTo };
};
