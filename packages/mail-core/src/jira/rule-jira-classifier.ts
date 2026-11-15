import type { JiraClassification, JiraClassifier, ParsedMessage } from '@relay/engine';
import { htmlToText } from '../parser/snippet';
import { extractJiraActor } from './jira-actor';
import { isJiraNotification, type JiraSenderConfig } from './jira-detection';
import { detectJiraEventKind } from './jira-event-kind';
import { extractJiraKey } from './jira-key';

const bodyText = (message: ParsedMessage): string => {
  if (message.textBody !== null && message.textBody.trim() !== '') {
    return message.textBody;
  }
  return message.htmlBody === null ? '' : htmlToText(message.htmlBody);
};

export class RuleJiraClassifier implements JiraClassifier {
  constructor(private readonly config: JiraSenderConfig = {}) {}

  classify(message: ParsedMessage): Promise<JiraClassification | null> {
    return Promise.resolve(this.classifySync(message));
  }

  classifySync(message: ParsedMessage): JiraClassification | null {
    if (!isJiraNotification(message, this.config)) {
      return null;
    }
    const jiraKey = extractJiraKey(message);
    if (!jiraKey) {
      return null;
    }
    const body = bodyText(message);
    return {
      jiraKey,
      eventKind: detectJiraEventKind(message.subject, body),
      actor: extractJiraActor(message.subject, body, message.from),
    };
  }
}
