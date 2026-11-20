import type { JiraClassification, SplitMatchSubject } from '@relay/engine';
import {
  type Address,
  type AutomationCondition,
  type AutomationConditionType,
  subjectContains,
} from '@relay/shared/domain';
import type { RegexCache } from './regex-cache';
import { MAX_MATCH_INPUT_LENGTH } from './regex-safety';

export interface RuleContext {
  readonly message: SplitMatchSubject;
  readonly jira: JiraClassification | null;
  readonly regex: RegexCache;
}

type RuleOf<Type extends AutomationConditionType> = Extract<AutomationCondition, { type: Type }>;
type RuleEvaluator<Type extends AutomationConditionType> = (
  rule: RuleOf<Type>,
  context: RuleContext,
) => boolean;

const capped = (value: string): string => value.slice(0, MAX_MATCH_INPUT_LENGTH);

const senderEmail = (context: RuleContext): string =>
  context.message.from?.email.toLowerCase() ?? '';

const inDomain = (email: string, wanted: string): boolean => {
  const domain = wanted.trim().toLowerCase().replace(/^@/, '');
  const emailDomain = email.toLowerCase().split('@')[1] ?? '';
  return emailDomain !== '' && (emailDomain === domain || emailDomain.endsWith(`.${domain}`));
};

const matchesFromDomain: RuleEvaluator<'fromDomain'> = (rule, context) =>
  inDomain(senderEmail(context), rule.domain);

const recipientsOf = (rule: RuleOf<'recipient'>, context: RuleContext): readonly Address[] => {
  const to = context.message.to ?? [];
  const cc = context.message.cc ?? [];
  if (rule.field === 'to') {
    return to;
  }
  if (rule.field === 'cc') {
    return cc;
  }
  return [...to, ...cc];
};

const matchesRecipient: RuleEvaluator<'recipient'> = (rule, context) =>
  recipientsOf(rule, context).some((recipient) =>
    rule.match === 'domain'
      ? inDomain(recipient.email, rule.value)
      : recipient.email.toLowerCase() === rule.value.trim().toLowerCase(),
  );

const matchesHasAttachment: RuleEvaluator<'hasAttachment'> = (_rule, context) =>
  context.message.hasAttachments === true;

const matchesFromAddress: RuleEvaluator<'fromAddress'> = (rule, context) =>
  senderEmail(context) === rule.address.toLowerCase();

const matchesSubjectRegex: RuleEvaluator<'subjectRegex'> = (rule, context) =>
  context.regex
    .get(rule.pattern, rule.caseSensitive ? 'u' : 'iu')
    ?.test(capped(context.message.subject)) ?? false;

const matchesSubjectContains: RuleEvaluator<'subjectContains'> = (rule, context) =>
  subjectContains(capped(context.message.subject), rule.value);

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

const matchesJiraEvent: RuleEvaluator<'jiraEvent'> = (rule, context) =>
  context.jira?.eventKind === rule.kind;

const EVALUATORS: { readonly [Type in AutomationConditionType]: RuleEvaluator<Type> } = {
  fromDomain: matchesFromDomain,
  fromAddress: matchesFromAddress,
  subjectRegex: matchesSubjectRegex,
  header: matchesHeader,
  jira: matchesJira,
  jiraEvent: matchesJiraEvent,
  recipient: matchesRecipient,
  hasAttachment: matchesHasAttachment,
  subjectContains: matchesSubjectContains,
};

export const evaluateRule = (rule: AutomationCondition, context: RuleContext): boolean => {
  const evaluator = EVALUATORS[rule.type] as RuleEvaluator<typeof rule.type>;
  return evaluator(rule, context);
};
