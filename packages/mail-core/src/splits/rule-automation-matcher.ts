import type { AutomationMatcher, AutomationMatchInput } from '@relay/engine';
import { RegexCache } from './regex-cache';
import { evaluateRule } from './rule-evaluators';

export class RuleAutomationMatcher implements AutomationMatcher {
  private readonly regex = new RegexCache();

  matches(input: AutomationMatchInput): Promise<boolean> {
    const context = { message: input.message, jira: input.jira, regex: this.regex };
    return Promise.resolve(
      input.conditions.length > 0 &&
        input.conditions.every((condition) => evaluateRule(condition, context)),
    );
  }
}
