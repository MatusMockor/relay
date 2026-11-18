import type { AccountId, JiraKey, ThreadId } from '@relay/shared/domain';
import type { StoredMatchSubject } from './message-repository';

export interface InboxCandidate {
  readonly threadId: ThreadId;
  readonly jiraKey: JiraKey | null;
  readonly lastMessageAt: string;
  readonly messages: readonly StoredMatchSubject[];
}

export interface AutomationCandidateRepository {
  listInbox(accountId: AccountId, limit: number): Promise<InboxCandidate[]>;
}
