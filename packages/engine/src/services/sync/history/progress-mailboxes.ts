import type { MailAccount, Mailbox, MailboxRole } from '@relay/shared/domain';
import { labelsMessages } from '../../shared/mail-copies';

const GMAIL_DISTINCT_ROLES: readonly MailboxRole[] = ['archive', 'spam', 'trash'];

export const countedMailboxes = (
  account: MailAccount | null,
  targets: readonly (readonly [Mailbox, MailboxRole])[],
): Mailbox[] => {
  const all = targets.map(([mailbox]) => mailbox);
  if (account === null || !labelsMessages(account)) {
    return all;
  }
  if (!targets.some(([, role]) => role === 'archive')) {
    return all;
  }
  return targets
    .filter(([, role]) => GMAIL_DISTINCT_ROLES.includes(role))
    .map(([mailbox]) => mailbox);
};
