import type { MailAccount, Mailbox, Split, UserId } from '@relay/shared/domain';

export interface AccountSearchScope {
  readonly userId: UserId;
  readonly account: MailAccount;
  readonly mailboxes: readonly Mailbox[];
  readonly splits: readonly Split[];
}

export type SearchLiveness = () => boolean;

export type AccountSearchOutcome = 'ok' | 'partial' | 'offline' | 'skipped';
