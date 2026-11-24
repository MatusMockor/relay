import type { AutomationCriteria } from '@relay/shared/domain';
import type { JiraClassification } from '../model/jira';
import type { SplitMatchSubject } from '../model/split-match-subject';

export interface AutomationMatchInput {
  readonly message: SplitMatchSubject;
  readonly jira: JiraClassification | null;
  readonly criteria: AutomationCriteria;
}

export interface AutomationMatcher {
  matches(input: AutomationMatchInput): Promise<boolean>;
}
