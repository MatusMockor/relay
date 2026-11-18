import type { AccountId, MailAccount } from '@relay/shared';
import { useLabels, useMailboxes } from '../../../data/hooks/use-mail-queries';
import { type ActionTargets, isGmailAccount } from './action-targets';

export const useActionTargets = (
  accountId: AccountId | null,
  accounts: readonly MailAccount[],
): ActionTargets => {
  const mailboxes = useMailboxes(accountId);
  const labels = useLabels();
  const loaded = accountId !== null && mailboxes.isSuccess && labels.isSuccess;
  const accountMailboxes = mailboxes.data ?? [];
  return {
    mailboxes: accountMailboxes,
    labels: (labels.data ?? []).filter((label) => label.accountId === accountId),
    loaded,
    gmail: isGmailAccount(
      accounts.find((account) => account.id === accountId),
      accountMailboxes,
    ),
  };
};
