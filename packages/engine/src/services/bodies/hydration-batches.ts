import type { MailboxId } from '@relay/shared/domain';
import type { HydrationCandidate } from '../../ports/message-body-store';
import type { HistoryTarget } from '../sync/history/history-mailboxes';

export interface HydrationBatch {
  readonly target: HistoryTarget | null;
  readonly candidates: readonly HydrationCandidate[];
  readonly bytes: number;
}

export interface HydrationPlan {
  readonly batches: readonly HydrationBatch[];
  readonly oversized: readonly HydrationCandidate[];
}

export interface HydrationLimits {
  readonly batchSize: number;
  readonly batchBytes: number;
  readonly messageBytes: number;
}

const estimatedBytes = (candidate: HydrationCandidate): number =>
  candidate.attachments.reduce((total, attachment) => total + attachment.size, 0);

const packed = (
  target: HistoryTarget | null,
  group: readonly HydrationCandidate[],
  limits: HydrationLimits,
): HydrationBatch[] => {
  const batches: HydrationBatch[] = [];
  let current: HydrationCandidate[] = [];
  let bytes = 0;
  group.forEach((candidate) => {
    const size = estimatedBytes(candidate);
    const full = current.length >= limits.batchSize || bytes + size > limits.batchBytes;
    if (current.length > 0 && full) {
      batches.push({ target, candidates: current, bytes });
      current = [];
      bytes = 0;
    }
    current.push(candidate);
    bytes += size;
  });
  if (current.length > 0) {
    batches.push({ target, candidates: current, bytes });
  }
  return batches;
};

export const planHydration = (
  candidates: readonly HydrationCandidate[],
  targets: readonly HistoryTarget[],
  limits: HydrationLimits,
): HydrationPlan => {
  const targetOf = new Map(targets.map((target) => [target.mailbox.id, target]));
  const byMailbox = new Map<MailboxId, HydrationCandidate[]>();
  const oversized: HydrationCandidate[] = [];
  candidates.forEach((candidate) => {
    if (estimatedBytes(candidate) > limits.messageBytes) {
      oversized.push(candidate);
      return;
    }
    byMailbox.set(candidate.mailboxId, [...(byMailbox.get(candidate.mailboxId) ?? []), candidate]);
  });
  const batches = [...byMailbox].flatMap(([mailboxId, group]) =>
    packed(targetOf.get(mailboxId) ?? null, group, limits),
  );
  return { batches, oversized };
};
