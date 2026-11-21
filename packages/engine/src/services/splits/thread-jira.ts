import type { JiraKey, MessageId } from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type { InboxCandidate } from '../../ports/automation-candidate-repository';
import type { JiraByMessage } from '../automations/automation-backlog-matcher';

export const threadJira = (jiraKey: JiraKey | null | undefined): JiraClassification | null =>
  jiraKey == null ? null : { jiraKey, eventKind: 'other', actor: null };

export const threadJiraOf = (candidates: readonly InboxCandidate[]): JiraByMessage =>
  new Map<MessageId, JiraClassification | null>(
    candidates.flatMap((candidate) =>
      candidate.messages.map((item) => [item.messageId, threadJira(candidate.jiraKey)] as const),
    ),
  );
