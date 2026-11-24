import type { MailAccount, Mailbox, Split, UserId } from '@relay/shared/domain';
import type { Clock } from '../../../ports/clock';
import type { MailProvider } from '../../../ports/mail-provider';
import type { SyncContext } from '../sync-context';
import { SyncJournal } from '../sync-journal';

export interface QuietSession {
  readonly userId: UserId;
  readonly account: MailAccount;
  readonly provider: MailProvider;
}

export const quietSyncContext = (
  session: QuietSession,
  mailboxes: readonly Mailbox[],
  splits: readonly Split[],
  clock: Clock,
): SyncContext => ({
  ...session,
  splits,
  mailboxRoles: new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role])),
  journal: new SyncJournal(session.account.id, clock, { quiet: true }),
  stats: { newMessages: 0, updatedThreads: 0 },
  arrivals: [],
  arrivalWork: [],
});
