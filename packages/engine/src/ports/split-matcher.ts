import type { Split, SplitId } from '@relay/shared/domain';
import type { JiraClassification } from '../model/jira';
import type { ParsedMessage } from '../model/parsed-message';

export interface SplitMatchInput {
  readonly message: ParsedMessage;
  readonly jira: JiraClassification | null;
  readonly splits: readonly Split[];
}

export interface SplitMatcher {
  match(input: SplitMatchInput): Promise<SplitId[]>;
}
