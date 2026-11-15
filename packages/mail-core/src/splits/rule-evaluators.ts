import type { JiraClassification, SplitMatchSubject } from '@relay/engine';
import type { SplitRule, SplitRuleType } from '@relay/shared/domain';
import type { RegexCache } from './regex-cache';
import { MAX_MATCH_INPUT_LENGTH } from './regex-safety';

export interface RuleContext {
  readonly message: SplitMatchSubject;
  readonly jira: JiraClassification | null;
  readonly regex: RegexCache;
}

type RuleOf<Type extends SplitRuleType> = Extract<SplitRule, { type: Type }>;
type RuleEvaluator<Type extends SplitRuleType> = (
  rule: RuleOf<Type>,
  context: RuleContext,
) => boolean;

const capped = (value: string): string => value.slice(0, MAX_MATCH_INPUT_LENGTH);

const senderEmail = (context: RuleContext): string =>
  context.message.from?.email.toLowerCase() ?? '';

const matchesFromDomain: RuleEvaluator<'fromDomain'> = (rule, context) => {
  const domain = rule.domain.trim().toLowerCase().replace(/^@/, '');
  const senderDomain = senderEmail(context).split('@')[1] ?? '';
  return senderDomain !== '' && (senderDomain === domain || senderDomain.endsWith(`.${domain}`));
};

const matchesFromAddress: RuleEvaluator<'fromAddress'> = (rule, context) =>
  senderEmail(context) === rule.address.toLowerCase();

const matchesSubjectRegex: RuleEvaluator<'subjectRegex'> = (rule, context) =>
  context.regex
    .get(rule.pattern, rule.caseSensitive ? 'u' : 'iu')
    ?.test(capped(context.message.subject)) ?? false;

const matchesHeader: RuleEvaluator<'header'> = (rule, context) => {
  const regex = context.regex.get(rule.pattern, 'iu');
  const values = context.message.headers.get(rule.name.trim().toLowerCase()) ?? [];
  return regex !== null && values.some((value) => regex.test(capped(value)));
};

const matchesJira: RuleEvaluator<'jira'> = (rule, context) => {
  if (!context.jira) {
    return false;
  }
  if (rule.projectKeys.length === 0) {
    return true;
  }
  const project = context.jira.jiraKey.split('-')[0] ?? '';
  return rule.projectKeys.includes(project);
};

const EVALUATORS: { readonly [Type in SplitRuleType]: RuleEvaluator<Type> } = {
  fromDomain: matchesFromDomain,
  fromAddress: matchesFromAddress,
  subjectRegex: matchesSubjectRegex,
  header: matchesHeader,
  jira: matchesJira,
};

export const evaluateRule = (rule: SplitRule, context: RuleContext): boolean => {
  const evaluator = EVALUATORS[rule.type] as RuleEvaluator<typeof rule.type>;
  return evaluator(rule, context);
};
