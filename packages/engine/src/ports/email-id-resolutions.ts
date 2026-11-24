import type { MailboxId, MessageId } from '@relay/shared/domain';

export interface UnresolvedPlacement {
  readonly messageId: MessageId;
  readonly uid: number;
}

export interface ResolvedEmailId {
  readonly uid: number;
  readonly emailId: string;
}

export interface EmailIdResolutions {
  listUnresolved(
    mailboxId: MailboxId,
    afterUid: number,
    limit: number,
  ): Promise<UnresolvedPlacement[]>;
  fillEmailIds(mailboxId: MailboxId, resolved: readonly ResolvedEmailId[]): Promise<number>;
}
