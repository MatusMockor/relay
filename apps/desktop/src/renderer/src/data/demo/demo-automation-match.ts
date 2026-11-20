import {
  type Address,
  type AutomationCondition,
  type AutomationConditionType,
  type AutomationCriteria,
  matchesCriteria,
  type Message,
  subjectContains,
} from '@relay/shared';
import { demoHeaderValues } from './demo-message-headers';
import type { DemoThreadRecord } from './demo-state';

const inDomain = (email: string, domain: string): boolean => {
  const wanted = domain.trim().toLowerCase().replace(/^@/, '');
  const actual = email.toLowerCase().split('@')[1] ?? '';
  return actual !== '' && (actual === wanted || actual.endsWith(`.${wanted}`));
};

const recipientsOf = (message: Message, field: 'to' | 'cc' | 'any'): Address[] => {
  if (field === 'to') {
    return message.to;
  }
  if (field === 'cc') {
    return message.cc;
  }
  return [...message.to, ...message.cc];
};

const safeTest = (pattern: string, value: string): boolean => {
  try {
    return new RegExp(pattern, 'iu').test(value);
  } catch {
    return false;
  }
};

const matchesJira = (projectKeys: readonly string[], jiraKey: string | null): boolean =>
  jiraKey !== null &&
  (projectKeys.length === 0 || projectKeys.includes(jiraKey.split('-')[0] ?? ''));

export const DEMO_UNSUPPORTED_EXCEPTIONS: readonly AutomationConditionType[] = [
  'jiraEvent',
  'header',
];

const matchesCondition = (
  condition: AutomationCondition,
  message: Message,
  jiraKey: string | null,
): boolean => {
  const sender = message.from?.email.toLowerCase() ?? '';
  switch (condition.type) {
    case 'fromAddress':
      return sender === condition.address.toLowerCase();
    case 'fromDomain':
      return inDomain(sender, condition.domain);
    case 'subjectRegex':
      return safeTest(condition.pattern, message.subject);
    case 'recipient':
      return recipientsOf(message, condition.field).some((recipient) =>
        condition.match === 'domain'
          ? inDomain(recipient.email, condition.value)
          : recipient.email.toLowerCase() === condition.value.toLowerCase(),
      );
    case 'hasAttachment':
      return message.attachments.some((attachment) => !attachment.inline);
    case 'subjectContains':
      return subjectContains(message.subject, condition.value);
    case 'jira':
      return matchesJira(condition.projectKeys, jiraKey);
    case 'header':
      return demoHeaderValues(message, condition.name).some((value) =>
        safeTest(condition.pattern, value),
      );
    case 'jiraEvent':
      return false;
  }
};

export const demoMessageMatches = (
  criteria: AutomationCriteria,
  message: Message,
  jiraKey: string | null,
): boolean =>
  matchesCriteria(criteria, (condition) => matchesCondition(condition, message, jiraKey));

export const demoRuleMatches = (criteria: AutomationCriteria, record: DemoThreadRecord): boolean =>
  record.messages.some((message) => demoMessageMatches(criteria, message, record.summary.jiraKey));
