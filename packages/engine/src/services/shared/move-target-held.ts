import type { MailboxId, MailboxRole, MailboxRoleOf, Message } from '@relay/shared/domain';

export interface MoveTarget {
  readonly role: MailboxRole;
  readonly mailboxId?: MailboxId;
}

export const holdsMoveTarget = (
  message: Message,
  target: MoveTarget,
  roleOf: MailboxRoleOf,
): boolean =>
  message.placements.some(({ mailboxId }) =>
    target.mailboxId === undefined
      ? roleOf(mailboxId) === target.role
      : mailboxId === target.mailboxId,
  );
