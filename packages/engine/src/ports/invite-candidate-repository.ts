import type { MailboxId, MessageId, ThreadId } from '@relay/shared/domain';

export interface InviteCandidate {
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly uid: number;
  readonly date: string;
}

export interface InviteCandidateRepository {
  listAfter(mailboxId: MailboxId, afterUid: number, limit: number): Promise<InviteCandidate[]>;
}
