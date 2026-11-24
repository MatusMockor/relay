import type {
  AccountId,
  JiraKey,
  Message,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type { StoredMatchSubject } from './message-repository';

export interface InboxCandidate {
  readonly threadId: ThreadId;
  readonly jiraKey: JiraKey | null;
  readonly lastMessageAt: string;
  readonly messages: readonly StoredMatchSubject[];
}

export interface RecentCandidatesQuery {
  readonly since: string;
  readonly limit: number;
}

export interface AutomationCandidateRepository {
  listInbox(accountId: AccountId, limit: number): Promise<InboxCandidate[]>;
  listRecent(accountId: AccountId, query: RecentCandidatesQuery): Promise<InboxCandidate[]>;
  findMessages(userId: UserId, messageIds: readonly MessageId[]): Promise<Message[]>;
}
