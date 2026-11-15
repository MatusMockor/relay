import type { JiraKey } from '@relay/shared/domain';

export type JiraEventKind = 'mention' | 'assigned' | 'comment' | 'status' | 'other';

export interface JiraClassification {
  readonly jiraKey: JiraKey;
  readonly eventKind: JiraEventKind;
  readonly actor: string | null;
}
