import type { AutomationCondition, SplitId } from '@relay/shared/domain';
import type {
  AutomationMatcher,
  AutomationMatchInput,
  JiraClassification,
  SplitMatcher,
  SplitMatchInput,
  SplitMatchSubject,
} from '../../../src';

const recipientsOf = (field: 'to' | 'cc' | 'any', message: SplitMatchSubject): string[] => {
  const to = field === 'cc' ? [] : (message.to ?? []);
  const cc = field === 'to' ? [] : (message.cc ?? []);
  return [...to, ...cc].map((address) => address.email.toLowerCase());
};

const matchesCondition = (
  rule: AutomationCondition,
  message: SplitMatchSubject,
  jira: JiraClassification | null,
): boolean => {
  const from = message.from?.email.toLowerCase() ?? '';
  switch (rule.type) {
    case 'fromDomain':
      return from.endsWith(`@${rule.domain.toLowerCase()}`);
    case 'fromAddress':
      return from === rule.address.toLowerCase();
    case 'subjectRegex':
      return new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i').test(message.subject);
    case 'header':
      return (message.headers.get(rule.name.toLowerCase()) ?? []).some((value) =>
        new RegExp(rule.pattern).test(value),
      );
    case 'jira':
      return (
        jira !== null &&
        (rule.projectKeys.length === 0 ||
          rule.projectKeys.some((key) => jira.jiraKey.startsWith(`${key}-`)))
      );
    case 'jiraEvent':
      return jira?.eventKind === rule.kind;
    case 'recipient':
      return recipientsOf(rule.field, message).some((email) =>
        rule.match === 'domain'
          ? email.endsWith(`@${rule.value.toLowerCase()}`)
          : email === rule.value.toLowerCase(),
      );
    case 'hasAttachment':
      return message.hasAttachments === true;
  }
};

export class RuleSplitMatcher implements SplitMatcher {
  match(input: SplitMatchInput): Promise<SplitId[]> {
    return Promise.resolve(
      input.splits
        .filter((split) =>
          split.rules.some((rule) => matchesCondition(rule, input.message, input.jira)),
        )
        .map((split) => split.id),
    );
  }
}

export class RuleAutomationMatcher implements AutomationMatcher {
  matches(input: AutomationMatchInput): Promise<boolean> {
    return Promise.resolve(
      input.conditions.every((condition) => matchesCondition(condition, input.message, input.jira)),
    );
  }
}
