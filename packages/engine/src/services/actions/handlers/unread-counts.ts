import type { MailboxId, Message } from '@relay/shared/domain';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import { PENDING_UID } from '../../shared/pending-uid';

const unreadDeltas = (targets: readonly Message[], seen: boolean): Map<MailboxId, number> => {
  const deltas = new Map<MailboxId, number>();
  for (const message of targets) {
    if (message.flags.seen === seen || message.uid === PENDING_UID) {
      continue;
    }
    deltas.set(message.mailboxId, (deltas.get(message.mailboxId) ?? 0) + (seen ? -1 : 1));
  }
  return deltas;
};

export const adjustUnreadCounts = async (
  mailboxes: MailboxRepository,
  targets: readonly Message[],
  seen: boolean,
): Promise<boolean> => {
  const deltas = unreadDeltas(targets, seen);
  for (const [mailboxId, delta] of deltas) {
    await mailboxes.adjustUnreadCount(mailboxId, delta);
  }
  return deltas.size > 0;
};
