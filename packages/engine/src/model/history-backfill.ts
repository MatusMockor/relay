import type { AccountId, MailboxId } from '@relay/shared/domain';

export interface HistoryCursor {
  readonly mailboxId: MailboxId;
  readonly accountId: AccountId;
  readonly uidValidity: number;
  readonly belowUid: number;
  readonly doneAt: string | null;
  readonly updatedAt: string;
}

export interface HistoryMailboxCount {
  readonly mailboxId: MailboxId;
  readonly stored: number;
}

export interface HistoryMailboxReport {
  readonly mailboxId: MailboxId;
  readonly processed: number;
  readonly done: boolean;
}

export type HistorySkipReason = 'busy' | 'unsupported';

export type HistorySliceReport =
  | { readonly skipped: true; readonly reason: HistorySkipReason }
  | {
      readonly skipped: false;
      readonly processed: number;
      readonly hydrated: number;
      readonly more: boolean;
      readonly perMailbox: readonly HistoryMailboxReport[];
    };
