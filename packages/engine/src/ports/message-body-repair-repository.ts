import type { MailboxId, MessageId, ThreadId } from '@relay/shared/domain';

export interface BodyRepairCandidate {
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly uid: number;
  readonly messageIdHeader: string | null;
}

export interface RepairedMessageBody {
  readonly textBody: string | null;
  readonly htmlBody: string | null;
  readonly snippet: string;
}

export interface MessageBodyRepairRepository {
  listAfter(mailboxId: MailboxId, afterUid: number, limit: number): Promise<BodyRepairCandidate[]>;
  updateBody(messageId: MessageId, body: RepairedMessageBody): Promise<void>;
}
