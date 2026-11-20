import type { ThreadId, ThreadPage } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';

export const TOMBSTONE_LIMIT = 1_000;

interface Tombstones {
  sequence: number;
  readonly removed: Map<ThreadId, number>;
}

const ledgers = new WeakMap<QueryClient, Tombstones>();

const tombstonesOf = (client: QueryClient): Tombstones => {
  const known = ledgers.get(client);
  if (known !== undefined) {
    return known;
  }
  const created: Tombstones = { sequence: 0, removed: new Map() };
  ledgers.set(client, created);
  return created;
};

const prune = (tombstones: Tombstones): void => {
  for (const threadId of tombstones.removed.keys()) {
    if (tombstones.removed.size <= TOMBSTONE_LIMIT) {
      return;
    }
    tombstones.removed.delete(threadId);
  }
};

export const removalMark = (client: QueryClient): number => tombstonesOf(client).sequence;

export const markThreadRemoved = (client: QueryClient, threadId: ThreadId): void => {
  const tombstones = tombstonesOf(client);
  tombstones.sequence += 1;
  tombstones.removed.delete(threadId);
  tombstones.removed.set(threadId, tombstones.sequence);
  prune(tombstones);
};

export const forgetThreadRemoval = (client: QueryClient, threadId: ThreadId): void => {
  tombstonesOf(client).removed.delete(threadId);
};

export const withoutRemovedSince = (
  client: QueryClient,
  mark: number,
  page: ThreadPage,
): ThreadPage => {
  const { removed } = tombstonesOf(client);
  const kept = page.items.filter((item) => (removed.get(item.id) ?? 0) <= mark);
  return kept.length === page.items.length ? page : { ...page, items: kept };
};
