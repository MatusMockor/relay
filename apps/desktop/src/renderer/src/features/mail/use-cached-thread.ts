import type { ThreadDetail, ThreadId, ThreadSummary } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { queryKeys } from '../../data/hooks/query-keys';
import { findCachedThread } from '../../data/hooks/thread-cache';

export const useCachedThread = (threadId: ThreadId | null): ThreadSummary | null => {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (notify: () => void) => queryClient.getQueryCache().subscribe(notify),
    [queryClient],
  );
  const snapshot = () =>
    threadId === null
      ? null
      : (findCachedThread(queryClient, threadId) ??
        queryClient.getQueryData<ThreadDetail>(queryKeys.thread(threadId))?.thread ??
        null);
  return useSyncExternalStore(subscribe, snapshot);
};
