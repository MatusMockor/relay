import { isPendingPlacement, type MailboxId, type Message } from '@relay/shared/domain';
import type { MailboxRepository } from '../../../ports/mailbox-repository';

const unreadDeltas = (targets: readonly Message[], seen: boolean): Map<MailboxId, number> => {
  const deltas = new Map<MailboxId, number>();
  for (const message of targets) {
    if (message.flags.seen === seen) {
      continue;
    }
    const known = message.placements.filter((placement) => !isPendingPlacement(placement));
    for (const { mailboxId } of known) {
      deltas.set(mailboxId, (deltas.get(mailboxId) ?? 0) + (seen ? -1 : 1));
    }
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
