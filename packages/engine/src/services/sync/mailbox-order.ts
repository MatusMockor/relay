import type { MailboxId, MailboxRole } from '@relay/shared/domain';
import type { SyncContext } from './sync-context';

export const mailboxOrder = (context: SyncContext, roles: readonly MailboxRole[]): MailboxId[] => {
  const rank = (role: MailboxRole): number => {
    const index = roles.indexOf(role);
    return index === -1 ? roles.length : index;
  };
  return [...context.mailboxRoles.entries()]
    .sort(([, left], [, right]) => rank(left) - rank(right))
    .map(([mailboxId]) => mailboxId);
};
