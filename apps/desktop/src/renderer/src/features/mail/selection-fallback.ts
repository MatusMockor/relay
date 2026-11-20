import { sortsAfter } from '../../data/thread-order';
import type { ListItem } from './list-items';

export interface ListState {
  readonly items: readonly ListItem[];
  readonly hasMore: boolean;
}

const firstSurvivor = (
  candidates: readonly ListItem[],
  present: ReadonlySet<string>,
): string | null => candidates.find((item) => present.has(item.key))?.key ?? null;

const beyondLoadedRange = (removed: ListItem, current: ListState): boolean => {
  if (!current.hasMore || removed.kind !== 'thread') {
    return false;
  }
  const last = current.items.findLast((item) => item.kind === 'thread');
  return last?.kind !== 'thread' || sortsAfter(removed.thread, last.thread);
};

export const replacementKeyOf = (
  removedKey: string,
  previous: readonly ListItem[],
  current: ListState,
): string | null => {
  const index = previous.findIndex((item) => item.key === removedKey);
  const removed = previous[index];
  if (removed === undefined || beyondLoadedRange(removed, current)) {
    return null;
  }
  const present = new Set(current.items.map((item) => item.key));
  return (
    firstSurvivor(previous.slice(index + 1), present) ??
    firstSurvivor(previous.slice(0, index).reverse(), present)
  );
};
