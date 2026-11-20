import type { MailboxId } from '@relay/shared/domain';
import type { HydrationCandidate } from '../../ports/message-body-store';
import type { HistoryTarget } from '../sync/history/history-mailboxes';

export interface HydrationBatch {
  readonly target: HistoryTarget | null;
  readonly candidates: readonly HydrationCandidate[];
}

export const hydrationBatches = (
  candidates: readonly HydrationCandidate[],
  targets: readonly HistoryTarget[],
  size: number,
): HydrationBatch[] => {
  const targetOf = new Map(targets.map((target) => [target.mailbox.id, target]));
  const byMailbox = new Map<MailboxId, HydrationCandidate[]>();
  candidates.forEach((candidate) => {
    byMailbox.set(candidate.mailboxId, [...(byMailbox.get(candidate.mailboxId) ?? []), candidate]);
  });
  return [...byMailbox].flatMap(([mailboxId, group]) => {
    const target = targetOf.get(mailboxId) ?? null;
    const batches: HydrationBatch[] = [];
    for (let start = 0; start < group.length; start += size) {
      batches.push({ target, candidates: group.slice(start, start + size) });
    }
    return batches;
  });
};
