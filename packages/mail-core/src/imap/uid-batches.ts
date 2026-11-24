import type { ImapFlow, SearchObject } from 'imapflow';
import { requireAccepted } from './imap-results';

export type SearchClient = Pick<ImapFlow, 'search'>;

export const requireBatchSize = (size: number): number => {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError(`Batch size must be a positive integer, got ${String(size)}`);
  }
  return size;
};

export const chunk = <Item>(items: readonly Item[], size: number): Item[][] => {
  const step = requireBatchSize(size);
  const batches: Item[][] = [];
  for (let index = 0; index < items.length; index += step) {
    batches.push(items.slice(index, index + step));
  }
  return batches;
};

export const sortedUids = (uids: readonly number[], minUid = 1): number[] =>
  [...new Set(uids)].filter((uid) => uid >= minUid).sort((left, right) => left - right);

export const searchUids = async (
  client: SearchClient,
  query: SearchObject,
  minUid = 1,
): Promise<number[]> =>
  sortedUids(requireAccepted('search', await client.search(query, { uid: true })), minUid);

export const uidSet = (uids: readonly number[]): string => {
  const ranges: [number, number][] = [];
  for (const uid of sortedUids(uids)) {
    const last = ranges.at(-1);
    if (last !== undefined && uid === last[1] + 1) {
      last[1] = uid;
      continue;
    }
    ranges.push([uid, uid]);
  }
  return ranges
    .map(([from, to]) => (from === to ? String(from) : `${String(from)}:${String(to)}`))
    .join(',');
};
