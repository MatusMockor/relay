import type { AutomationPreviewBody, AutomationPreviewResponse } from '@relay/shared/api';
import type { UserId } from '@relay/shared/domain';
import type { SplitPatternPolicy } from '../../ports/split-pattern-policy';
import { assertRulePatterns } from '../splits/split-rule-validator';
import type { RecentMatches } from './recent-matches';

export interface AutomationPreviewDeps {
  readonly recent: RecentMatches;
  readonly patterns: SplitPatternPolicy;
}

export class AutomationPreview {
  constructor(private readonly deps: AutomationPreviewDeps) {}

  async preview(userId: UserId, body: AutomationPreviewBody): Promise<AutomationPreviewResponse> {
    assertRulePatterns(
      { kind: 'Automation', name: 'preview', rules: [...body.conditions, ...body.exceptions] },
      this.deps.patterns,
    );
    const result = await this.deps.recent.collect(userId, body.accountId, body);
    return this.deps.recent.respond(userId, result);
  }
}
