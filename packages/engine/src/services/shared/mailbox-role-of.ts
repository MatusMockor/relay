import type { Mailbox, MailboxId, MailboxRole, MailboxRoleOf } from '@relay/shared/domain';

export const roleMapLookup =
  (roles: ReadonlyMap<MailboxId, MailboxRole>): MailboxRoleOf =>
  (mailboxId) =>
    roles.get(mailboxId);

export const mailboxRoleOf = (mailboxes: readonly Mailbox[]): MailboxRoleOf =>
  roleMapLookup(new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role])));
