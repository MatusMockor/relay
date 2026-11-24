import type { AccountId, ThreadId } from '@relay/shared/domain';

export interface SubjectWindow {
  readonly normalizedSubject: string;
  readonly since: Date;
  readonly until: Date;
}

export interface ThreadLookup {
  findByMessageIds(accountId: AccountId, messageIds: readonly string[]): Promise<ThreadId | null>;
  findByReplyTo(accountId: AccountId, messageIds: readonly string[]): Promise<ThreadId | null>;
  findBySubject(accountId: AccountId, window: SubjectWindow): Promise<ThreadId | null>;
}
