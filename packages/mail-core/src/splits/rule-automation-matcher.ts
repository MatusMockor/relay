import type { AutomationMatcher, AutomationMatchInput } from '@relay/engine';
import { matchesCriteria } from '@relay/shared/domain';
import { RegexCache } from './regex-cache';
import { evaluateRule } from './rule-evaluators';

export class RuleAutomationMatcher implements AutomationMatcher {
  private readonly regex = new RegexCache();

  matches(input: AutomationMatchInput): Promise<boolean> {
    const context = { message: input.message, jira: input.jira, regex: this.regex };
    return Promise.resolve(
      matchesCriteria(input.criteria, (condition) => evaluateRule(condition, context)),
    );
  }
}
