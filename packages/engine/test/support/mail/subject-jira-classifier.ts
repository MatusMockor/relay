import { JiraKeySchema } from '@relay/shared/domain';
import type {
  JiraClassification,
  JiraClassifier,
  JiraEventKind,
  ParsedMessage,
} from '../../../src';

const EVENT_KINDS: readonly JiraEventKind[] = ['mention', 'assigned', 'comment', 'status', 'other'];

export class SubjectJiraClassifier implements JiraClassifier {
  classify(message: ParsedMessage): Promise<JiraClassification | null> {
    const fromJira = message.from?.email.toLowerCase().startsWith('jira@') ?? false;
    const key = JiraKeySchema.safeParse(/\[([A-Z][A-Z0-9_]+-\d+)\]/.exec(message.subject)?.[1]);
    if (!fromJira || !key.success) {
      return Promise.resolve(null);
    }
    const event = message.headers.get('x-jira-event')?.[0] ?? 'other';
    const eventKind = EVENT_KINDS.find((kind) => kind === event) ?? 'other';
    const actor = message.headers.get('x-jira-actor')?.[0] ?? null;
    return Promise.resolve({ jiraKey: key.data, eventKind, actor });
  }
}
