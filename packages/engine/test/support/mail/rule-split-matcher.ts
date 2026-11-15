import type { SplitId, SplitRule } from '@relay/shared/domain';
import type {
  JiraClassification,
  SplitMatcher,
  SplitMatchInput,
  SplitMatchSubject,
} from '../../../src';

const matchesRule = (
  rule: SplitRule,
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
  }
};

export class RuleSplitMatcher implements SplitMatcher {
  match(input: SplitMatchInput): Promise<SplitId[]> {
    return Promise.resolve(
      input.splits
        .filter((split) => split.rules.some((rule) => matchesRule(rule, input.message, input.jira)))
        .map((split) => split.id),
    );
  }
}
