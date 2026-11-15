import type { MailAccount, MailboxId, MailboxRole, Split, UserId } from '@relay/shared/domain';
import type { MailProvider } from '../../ports/mail-provider';
import type { InboxArrival } from './sync-arrivals';
import type { ThreadChangeSet } from './thread-change-set';

export interface SyncStats {
  newMessages: number;
  updatedThreads: number;
}

export interface SyncContext {
  readonly userId: UserId;
  readonly account: MailAccount;
  readonly provider: MailProvider;
  readonly splits: readonly Split[];
  readonly mailboxRoles: Map<MailboxId, MailboxRole>;
  readonly changes: ThreadChangeSet;
  readonly stats: SyncStats;
  readonly arrivals: InboxArrival[];
}

export const inboxMailboxIds = (context: SyncContext): Set<MailboxId> =>
  new Set(
    [...context.mailboxRoles.entries()]
      .filter(([, role]) => role === 'inbox')
      .map(([mailboxId]) => mailboxId),
  );
