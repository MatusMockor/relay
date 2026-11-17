import type { JiraEventKind, JiraKey } from '@relay/shared/domain';

export type { JiraEventKind };

export interface JiraClassification {
  readonly jiraKey: JiraKey;
  readonly eventKind: JiraEventKind;
  readonly actor: string | null;
}
