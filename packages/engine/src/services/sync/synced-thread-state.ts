import type {
  MailboxId,
  MailboxRole,
  Message,
  MessageId,
  ThreadState,
  ThreadSummary,
} from '@relay/shared/domain';
import type { ThreadRefreshWork } from '../../model/pending-work';

export type MessageRoleOf = (message: Message) => MailboxRole | undefined;

const RESTORE_ROLES: readonly MailboxRole[] = ['inbox', 'archive'];

export const messageRoleOf =
  (
    mailboxRoles: ReadonlyMap<MailboxId, MailboxRole>,
    pendingMoves: ReadonlyMap<MessageId, MailboxRole>,
  ): MessageRoleOf =>
  (message) =>
    pendingMoves.get(message.id) ?? mailboxRoles.get(message.mailboxId);

const onlyInTrash = (roles: readonly (MailboxRole | undefined)[]): boolean => {
  const placed = roles.filter((role) => role !== 'sent');
  return placed.length > 0 && placed.every((role) => role === 'trash');
};

const reappeared = (
  work: ThreadRefreshWork,
  roles: readonly (MailboxRole | undefined)[],
): boolean =>
  work.arrivedIn.some((role) => RESTORE_ROLES.includes(role)) &&
  roles.some((role) => role !== undefined && RESTORE_ROLES.includes(role));

const leftTrash = (work: ThreadRefreshWork, roles: readonly (MailboxRole | undefined)[]) =>
  !roles.includes('trash') || reappeared(work, roles);

export const syncedThreadState = (
  work: ThreadRefreshWork,
  existing: ThreadSummary | null,
  messages: readonly Message[],
  roleOf: MessageRoleOf,
): ThreadState => {
  const roles = messages.map(roleOf);
  const inInbox = roles.includes('inbox');
  if (work.arrivedIn.includes('inbox') && inInbox) {
    return 'inbox';
  }
  if (onlyInTrash(roles)) {
    return 'trash';
  }
  if (existing === null) {
    return 'done';
  }
  if (existing.state === 'trash' && leftTrash(work, roles)) {
    return inInbox ? 'inbox' : 'done';
  }
  if (work.expungedFromInbox && existing.state === 'inbox' && !inInbox) {
    return 'done';
  }
  return existing.state;
};
