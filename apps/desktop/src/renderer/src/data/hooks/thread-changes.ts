import type { ThreadId, ThreadPage, ThreadSummary } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { leavesList } from '../list-membership';
import type { ThreadListParams } from '../MailClient';

export type ThreadChanges = ReadonlyMap<ThreadId, ThreadSummary | null>;

const watches = new WeakMap<QueryClient, Set<Map<ThreadId, ThreadSummary | null>>>();

const watchesOf = (client: QueryClient): Set<Map<ThreadId, ThreadSummary | null>> => {
  const known = watches.get(client);
  if (known !== undefined) {
    return known;
  }
  const created = new Set<Map<ThreadId, ThreadSummary | null>>();
  watches.set(client, created);
  return created;
};

export const recordThreadChange = (
  client: QueryClient,
  threadId: ThreadId,
  thread: ThreadSummary | null,
): void => {
  watchesOf(client).forEach((changes) => {
    changes.set(threadId, thread);
  });
};

export const reconcilePage = (
  params: ThreadListParams,
  page: ThreadPage,
  changes: ThreadChanges,
): ThreadPage => {
  if (changes.size === 0) {
    return page;
  }
  const items = page.items.flatMap((item) => {
    const changed = changes.get(item.id);
    if (changed === undefined) {
      return [item];
    }
    return changed === null || leavesList(params, changed) ? [] : [changed];
  });
  return { ...page, items };
};

export const whileWatchingChanges = async <T>(
  client: QueryClient,
  read: () => Promise<T>,
  settle: (value: T, changes: ThreadChanges) => T,
): Promise<T> => {
  const changes = new Map<ThreadId, ThreadSummary | null>();
  const active = watchesOf(client);
  active.add(changes);
  try {
    return settle(await read(), changes);
  } finally {
    active.delete(changes);
  }
};
