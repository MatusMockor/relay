import type { JiraClassification } from '../model/jira';
import type { ParsedMessage } from '../model/parsed-message';

export interface JiraClassifier {
  classify(message: ParsedMessage): Promise<JiraClassification | null>;
}
