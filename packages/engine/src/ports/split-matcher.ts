import type { Split, SplitId } from '@relay/shared/domain';
import type { JiraClassification } from '../model/jira';
import type { SplitMatchSubject } from '../model/split-match-subject';

export interface SplitMatchInput {
  readonly message: SplitMatchSubject;
  readonly jira: JiraClassification | null;
  readonly splits: readonly Split[];
}

export interface SplitMatcher {
  match(input: SplitMatchInput): Promise<SplitId[]>;
}
