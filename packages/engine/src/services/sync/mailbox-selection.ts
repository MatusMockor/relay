import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import type { SyncOptions } from './sync-options';

const subscriptionsKnown = (mailboxes: readonly Mailbox[]): boolean =>
  mailboxes.some((mailbox) => mailbox.subscribed);

const wanted = (mailbox: Mailbox, options: SyncOptions, subscriptions: boolean): boolean =>
  mailbox.role !== 'custom' ||
  options.syncUnsubscribedFolders ||
  !subscriptions ||
  mailbox.subscribed;

export const selectMailboxes = (
  mailboxes: readonly Mailbox[],
  options: SyncOptions,
): [Mailbox, MailboxRole][] => {
  const subscriptions = subscriptionsKnown(mailboxes);
  return options.mailboxRoles.flatMap((role) =>
    mailboxes
      .filter((mailbox) => mailbox.role === role && wanted(mailbox, options, subscriptions))
      .map((mailbox): [Mailbox, MailboxRole] => [mailbox, role]),
  );
};
