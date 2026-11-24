import { normalizeSubject } from '../../subjects/normalize-subject';
import type { WindowEntry } from './initial-window';

const subjectOnlyReply = (entry: WindowEntry): boolean =>
  entry.parentIds.length === 0 && normalizeSubject(entry.subject).hadReplyPrefix;

export const firstBatch = (ordered: readonly WindowEntry[], size: number): WindowEntry[] => {
  const deferred = new Set<string>();
  const batch: WindowEntry[] = [];
  for (const entry of ordered) {
    if (batch.length === size) {
      return batch;
    }
    if (subjectOnlyReply(entry) || entry.parentIds.some((id) => deferred.has(id))) {
      deferred.add(entry.messageId ?? '');
      continue;
    }
    batch.push(entry);
  }
  return batch;
};
