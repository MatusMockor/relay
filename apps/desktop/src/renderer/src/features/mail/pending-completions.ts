import type { FolderView, ThreadId } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { isThreadInView, removeThreadFromView } from '../../data/hooks/thread-cache';

export interface PendingCompletions {
  readonly add: (threadId: ThreadId) => void;
  readonly remove: (threadId: ThreadId) => void;
}

export const usePendingCompletions = (view: FolderView): PendingCompletions => {
  const queryClient = useQueryClient();
  const pending = useRef<ThreadId[]>([]);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') {
          return;
        }
        pending.current
          .filter((threadId) => isThreadInView(queryClient, view, threadId))
          .forEach((threadId) => {
            removeThreadFromView(queryClient, view, threadId);
          });
      }),
    [queryClient, view],
  );
  return {
    add: (threadId) => {
      pending.current.push(threadId);
    },
    remove: (threadId) => {
      const index = pending.current.indexOf(threadId);
      if (index < 0) {
        return;
      }
      pending.current.splice(index, 1);
    },
  };
};
