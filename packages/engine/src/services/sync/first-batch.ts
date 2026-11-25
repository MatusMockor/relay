import type { WindowEntry } from './initial-window';
import { subjectOnlyReply } from './subject-replies';

export interface FirstBatchLimits {
  readonly messages: number;
  readonly conversations: number;
}

export const firstBatch = (
  conversations: readonly (readonly WindowEntry[])[],
  limits: FirstBatchLimits,
): WindowEntry[] => {
  const deferred = new Set<string>();
  const batch: WindowEntry[] = [];
  let taken = 0;
  for (const conversation of conversations) {
    if (taken === limits.conversations) {
      return batch;
    }
    const before = batch.length;
    for (const entry of conversation) {
      if (batch.length === limits.messages) {
        return batch;
      }
      if (subjectOnlyReply(entry) || entry.parentIds.some((id) => deferred.has(id))) {
        deferred.add(entry.messageId ?? '');
        continue;
      }
      batch.push(entry);
    }
    taken += batch.length > before ? 1 : 0;
  }
  return batch;
};
