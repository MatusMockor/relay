import { type MailboxId, type MessageId, PENDING_UID } from '@relay/shared/domain';
import type { MergeMember, OwnedPlacement, PlacementReduction } from '../../model/message-merge';

interface Ranked {
  readonly owned: OwnedPlacement;
  readonly order: number;
}

const byMailbox = (members: readonly MergeMember[]): Map<MailboxId, Ranked[]> => {
  const grouped = new Map<MailboxId, Ranked[]>();
  for (const member of members) {
    for (const placement of member.placements) {
      const ranked = { owned: { messageId: member.id, placement }, order: member.order };
      grouped.set(placement.mailboxId, [...(grouped.get(placement.mailboxId) ?? []), ranked]);
    }
  }
  return grouped;
};

const survivorOrder =
  (keeperId: MessageId) =>
  (left: Ranked, right: Ranked): number => {
    const positive = (ranked: Ranked): number =>
      ranked.owned.placement.uid !== PENDING_UID ? 1 : 0;
    const kept = (ranked: Ranked): number => (ranked.owned.messageId === keeperId ? 1 : 0);
    return positive(right) - positive(left) || kept(right) - kept(left) || left.order - right.order;
  };

export const reducePlacements = (
  members: readonly MergeMember[],
  keeperId: MessageId,
): PlacementReduction => {
  const kept: OwnedPlacement[] = [];
  const dropped: OwnedPlacement[] = [];
  byMailbox(members).forEach((candidates) => {
    const [survivor, ...rest] = [...candidates].sort(survivorOrder(keeperId));
    if (survivor === undefined) {
      return;
    }
    kept.push(survivor.owned);
    dropped.push(...rest.map((ranked) => ranked.owned));
  });
  return { kept, dropped };
};
