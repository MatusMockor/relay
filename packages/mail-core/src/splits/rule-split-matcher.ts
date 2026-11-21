import type { SplitMatcher, SplitMatchInput } from '@relay/engine';
import { matchesCriteria, type SplitId, splitCriteria } from '@relay/shared/domain';
import { RegexCache } from './regex-cache';
import { evaluateRule } from './rule-evaluators';

export class RuleSplitMatcher implements SplitMatcher {
  private readonly regex = new RegexCache();

  match(input: SplitMatchInput): Promise<SplitId[]> {
    return Promise.resolve(this.matchSync(input));
  }

  matchSync(input: SplitMatchInput): SplitId[] {
    const context = { message: input.message, jira: input.jira, regex: this.regex };
    return [...input.splits]
      .sort((left, right) => left.order - right.order)
      .filter((split) =>
        matchesCriteria(splitCriteria(split), (rule) => evaluateRule(rule, context)),
      )
      .map((split) => split.id);
  }
}
