import type { SplitPreviewBody, SplitPreviewResponse } from '@relay/shared/api';
import { splitCriteria, type UserId } from '@relay/shared/domain';
import type { SplitPatternPolicy } from '../../ports/split-pattern-policy';
import type { RecentMatches } from '../automations/recent-matches';
import type { SplitOverlapFinder } from './split-overlap';
import { assertRulePatterns } from './split-rule-validator';
import { threadJiraOf } from './thread-jira';

export interface SplitPreviewDeps {
  readonly recent: RecentMatches;
  readonly overlaps: SplitOverlapFinder;
  readonly patterns: SplitPatternPolicy;
}

export class SplitPreview {
  constructor(private readonly deps: SplitPreviewDeps) {}

  async preview(userId: UserId, body: SplitPreviewBody): Promise<SplitPreviewResponse> {
    assertRulePatterns(
      { kind: 'Split', name: 'preview', rules: [...body.rules, ...body.exceptions] },
      this.deps.patterns,
    );
    const result = await this.deps.recent.collect(
      userId,
      body.accountId,
      splitCriteria(body),
      threadJiraOf,
    );
    const response = await this.deps.recent.respond(userId, result);
    return {
      ...response,
      overlaps: await this.deps.overlaps.find(userId, body, result.accounts),
    };
  }
}
