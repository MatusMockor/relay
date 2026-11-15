import type { ThreadAction, ThreadDetail, ThreadId, ThreadSummary } from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectThreadAction } from '../thread-projection';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';
import {
  findCachedThread,
  restoreThreadInLists,
  snapshotThreadLists,
  writeThreadToLists,
} from './thread-cache';

const chains = new Map<string, Promise<unknown>>();

const serialized = <T>(threadId: ThreadId, work: () => Promise<T>): Promise<T> => {
  const next = (chains.get(threadId) ?? Promise.resolve()).then(work, work);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  chains.set(threadId, settled);
  void settled.then(() => {
    if (chains.get(threadId) === settled) {
      chains.delete(threadId);
    }
  });
  return next;
};

export interface ThreadActionInput {
  readonly threadId: ThreadId;
  readonly action: ThreadAction;
}

export const useThreadAction = (onError?: (error: unknown) => void) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, action }: ThreadActionInput) =>
      serialized(threadId, () => client.applyThreadAction(threadId, action)),
    onMutate: async ({ threadId, action }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.threadLists() });
      const lists = snapshotThreadLists(queryClient);
      const detail = queryClient.getQueryData<ThreadDetail>(queryKeys.thread(threadId));
      const current = findCachedThread(queryClient, threadId) ?? detail?.thread ?? null;
      if (current !== null) {
        const next = projectThreadAction(current, action);
        writeThreadToLists(queryClient, next);
        if (detail !== undefined) {
          queryClient.setQueryData<ThreadDetail>(queryKeys.thread(threadId), {
            ...detail,
            thread: next,
          });
        }
      }
      return { lists, detail };
    },
    onError: (error, { threadId }, context) => {
      if (context !== undefined) {
        restoreThreadInLists(queryClient, context.lists, threadId);
        queryClient.setQueryData(queryKeys.thread(threadId), context.detail);
      }
      onError?.(error);
    },
    onSuccess: (thread: ThreadSummary) => {
      writeThreadToLists(queryClient, thread);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists() });
    },
  });
};
