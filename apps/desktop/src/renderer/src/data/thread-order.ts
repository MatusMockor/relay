import type { ThreadSummary } from '@relay/shared';

export type ThreadPosition = Pick<ThreadSummary, 'id' | 'lastMessageAt'>;

export const compareThreadPositions = (a: ThreadPosition, b: ThreadPosition): number => {
  const byTime = Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt);
  if (byTime !== 0) {
    return byTime;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? 1 : -1;
};

export const sortsAfter = (thread: ThreadPosition, boundary: ThreadPosition): boolean =>
  compareThreadPositions(thread, boundary) > 0;

export const lastPositionOf = (threads: readonly ThreadPosition[]): ThreadPosition | null =>
  threads.reduce<ThreadPosition | null>(
    (last, thread) => (last === null || sortsAfter(thread, last) ? thread : last),
    null,
  );
