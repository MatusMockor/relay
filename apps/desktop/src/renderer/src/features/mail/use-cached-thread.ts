import type { ThreadId, ThreadSummary } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { findKnownThread } from '../../data/hooks/thread-cache';

export const useCachedThread = (threadId: ThreadId | null): ThreadSummary | null => {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (notify: () => void) => queryClient.getQueryCache().subscribe(notify),
    [queryClient],
  );
  const snapshot = () => (threadId === null ? null : findKnownThread(queryClient, threadId));
  return useSyncExternalStore(subscribe, snapshot);
};
