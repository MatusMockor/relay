import type { FolderView, ThreadDetail, ThreadId, ThreadPage, ThreadSummary } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { keepActiveTask } from './keep-active-task';
import type { ThreadListParams } from '../MailClient';
import { leavesList } from '../list-membership';
import { queryKeys } from './query-keys';
import { recordThreadChange } from './thread-changes';

type ListEntry = readonly [readonly unknown[], ThreadPage | undefined];

const paramsOf = (key: readonly unknown[]): ThreadListParams | null => {
  const params = key[3];
  return typeof params === 'object' && params !== null ? (params as ThreadListParams) : null;
};

export const snapshotThreadLists = (client: QueryClient): ListEntry[] =>
  client.getQueriesData<ThreadPage>({ queryKey: queryKeys.threadLists() });

export const restoreThreadLists = (client: QueryClient, entries: readonly ListEntry[]): void => {
  entries.forEach(([key, data]) => {
    client.setQueryData(key, data);
  });
};

export const writeThreadToLists = (client: QueryClient, thread: ThreadSummary): void => {
  snapshotThreadLists(client).forEach(([key, page]) => {
    const params = paramsOf(key);
    if (page === undefined || params === null) {
      return;
    }
    const present = page.items.some((item) => item.id === thread.id);
    if (!present) {
      return;
    }
    const items = leavesList(params, thread)
      ? page.items.filter((item) => item.id !== thread.id)
      : page.items.map((item) => (item.id === thread.id ? keepActiveTask(thread, item) : item));
    client.setQueryData<ThreadPage>(key, { ...page, items });
  });
};

export const removeThreadFromLists = (client: QueryClient, threadId: ThreadId): void => {
  recordThreadChange(client, threadId, null);
  snapshotThreadLists(client).forEach(([key, page]) => {
    if (page === undefined) {
      return;
    }
    client.setQueryData<ThreadPage>(key, {
      ...page,
      items: page.items.filter((item) => item.id !== threadId),
    });
  });
};

export const removeThreadFromView = (
  client: QueryClient,
  view: FolderView,
  threadId: ThreadId,
): void => {
  snapshotThreadLists(client).forEach(([key, page]) => {
    if (page === undefined || paramsOf(key)?.view !== view) {
      return;
    }
    client.setQueryData<ThreadPage>(key, {
      ...page,
      items: page.items.filter((item) => item.id !== threadId),
    });
  });
};

export const isThreadInView = (
  client: QueryClient,
  view: FolderView,
  threadId: ThreadId,
): boolean =>
  snapshotThreadLists(client).some(
    ([key, page]) =>
      paramsOf(key)?.view === view && page?.items.some((item) => item.id === threadId) === true,
  );

export const findCachedThread = (client: QueryClient, threadId: ThreadId): ThreadSummary | null => {
  for (const [, page] of snapshotThreadLists(client)) {
    const found = page?.items.find((item) => item.id === threadId);
    if (found !== undefined) {
      return found;
    }
  }
  return null;
};

export const findKnownThread = (client: QueryClient, threadId: ThreadId): ThreadSummary | null =>
  findCachedThread(client, threadId) ??
  client.getQueryData<ThreadDetail>(queryKeys.thread(threadId))?.thread ??
  null;

export const restoreThreadInLists = (
  client: QueryClient,
  entries: readonly ListEntry[],
  threadId: ThreadId,
): void => {
  entries.forEach(([key, before]) => {
    const index = before?.items.findIndex((item) => item.id === threadId) ?? -1;
    const previous = before?.items[index];
    const current = client.getQueryData<ThreadPage>(key);
    if (previous === undefined || current === undefined) {
      return;
    }
    const rest = current.items.filter((item) => item.id !== threadId);
    client.setQueryData<ThreadPage>(key, {
      ...current,
      items: [...rest.slice(0, index), previous, ...rest.slice(index)],
    });
  });
};
