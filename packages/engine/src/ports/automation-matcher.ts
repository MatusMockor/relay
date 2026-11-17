import type { AutomationCondition } from '@relay/shared/domain';
import type { JiraClassification } from '../model/jira';
import type { SplitMatchSubject } from '../model/split-match-subject';

export interface AutomationMatchInput {
  readonly message: SplitMatchSubject;
  readonly jira: JiraClassification | null;
  readonly conditions: readonly AutomationCondition[];
}

export interface AutomationMatcher {
  matches(input: AutomationMatchInput): Promise<boolean>;
}
