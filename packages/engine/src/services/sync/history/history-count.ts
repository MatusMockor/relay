import type { AccountId, MailAccount, Mailbox, MailboxRole } from '@relay/shared/domain';
import type { HistoryBackfillRepository } from '../../../ports/history-backfill-repository';
import { labelsMessages } from '../../shared/mail-copies';

export interface HistoryCount {
  readonly stored: number;
  readonly total: number;
}

type Target = readonly [Mailbox, MailboxRole];

const GMAIL_DISTINCT_ROLES: readonly MailboxRole[] = ['archive', 'spam', 'trash'];

const totalOf = (mailboxes: readonly Mailbox[]): number =>
  mailboxes.reduce((sum, mailbox) => sum + mailbox.totalCount, 0);

const gmailDistinct = (account: MailAccount | null, targets: readonly Target[]): Mailbox[] => {
  if (account === null || !labelsMessages(account)) {
    return [];
  }
  if (!targets.some(([, role]) => role === 'archive')) {
    return [];
  }
  return targets
    .filter(([, role]) => GMAIL_DISTINCT_ROLES.includes(role))
    .map(([mailbox]) => mailbox);
};

const perMailbox = async (
  store: HistoryBackfillRepository,
  accountId: AccountId,
  mailboxes: readonly Mailbox[],
): Promise<HistoryCount> => {
  const counts = new Map(
    (await store.countsByMailbox(accountId)).map((count) => [count.mailboxId, count.stored]),
  );
  return {
    stored: mailboxes.reduce(
      (sum, mailbox) => sum + Math.min(counts.get(mailbox.id) ?? 0, mailbox.totalCount),
      0,
    ),
    total: totalOf(mailboxes),
  };
};

export const countHistory = async (
  store: HistoryBackfillRepository,
  account: MailAccount | null,
  accountId: AccountId,
  targets: readonly Target[],
): Promise<HistoryCount> => {
  const all = targets.map(([mailbox]) => mailbox);
  const distinct = gmailDistinct(account, targets);
  if (distinct.length === 0) {
    return perMailbox(store, accountId, all);
  }
  const total = totalOf(distinct);
  const stored = await store.countDistinct(
    accountId,
    all.map((mailbox) => mailbox.id),
  );
  return { stored: Math.min(stored, total), total };
};
