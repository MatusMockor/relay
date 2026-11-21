import type { EngineDeps } from '../../engine-deps';
import { AutomationBacklogMatcher } from '../automations/automation-backlog-matcher';
import { RecentMatches } from '../automations/recent-matches';
import type { EngineEvents } from '../shared/engine-events';
import { SplitMembershipEvaluator } from './split-membership-evaluator';
import { SplitOverlapFinder } from './split-overlap';
import { SplitPreview } from './split-preview';
import { PERMISSIVE_PATTERN_POLICY } from './split-rule-validator';
import { SplitService } from './split-service';

export const createSplitService = (deps: EngineDeps, events: EngineEvents): SplitService => {
  const { repositories, unitOfWork } = deps;
  const patterns = deps.splitPatternPolicy ?? PERMISSIVE_PATTERN_POLICY;
  const matcher = new AutomationBacklogMatcher({
    candidates: repositories.automationCandidates,
    matcher: deps.automationMatcher,
    classifier: deps.jiraClassifier,
  });
  return new SplitService({
    splits: repositories.splits,
    accounts: repositories.accounts,
    evaluator: new SplitMembershipEvaluator({
      splits: repositories.splits,
      messages: repositories.messages,
      threads: repositories.threads,
      matcher: deps.splitMatcher,
      unitOfWork,
    }),
    preview: new SplitPreview({
      recent: new RecentMatches({
        accounts: repositories.accounts,
        messages: repositories.messages,
        candidates: repositories.automationCandidates,
        matcher,
        clock: deps.clock,
      }),
      overlaps: new SplitOverlapFinder({
        splits: repositories.splits,
        automations: repositories.automations,
        matcher,
      }),
      patterns,
    }),
    events,
    ids: deps.idGenerator,
    patterns,
  });
};
