import type {
  AccountId,
  AttachmentMeta,
  MailboxId,
  MessageId,
  OfflineStats,
  ThreadId,
} from '@relay/shared/domain';

export interface HydrationCandidate {
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly mailboxId: MailboxId;
  readonly uid: number;
  readonly messageIdHeader: string | null;
  readonly snippet: string;
  readonly attachments: readonly AttachmentMeta[];
}

export interface HydratedBody {
  readonly textBody: string | null;
  readonly htmlBody: string | null;
  readonly snippet: string;
  readonly attachments: readonly AttachmentMeta[];
}

export interface MessageBodyStore {
  saveBody(messageId: MessageId, body: HydratedBody): Promise<boolean>;
  evictBefore(accountId: AccountId, before: Date, limit: number): Promise<number>;
  hydrationCandidates(
    accountId: AccountId,
    since: Date | null,
    limit: number,
    excluding: readonly MessageId[],
  ): Promise<HydrationCandidate[]>;
  stats(accountId: AccountId): Promise<OfflineStats>;
}
