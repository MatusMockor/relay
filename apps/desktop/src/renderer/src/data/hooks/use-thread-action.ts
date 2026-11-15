import type { ThreadAction, ThreadDetail, ThreadId, ThreadSummary } from '@relay/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
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
const inFlight = new Map<ThreadId, number>();
const unsettledDetail = new Set<ThreadId>();

const track = (threadId: ThreadId, delta: number): number => {
  const count = (inFlight.get(threadId) ?? 0) + delta;
  if (count <= 0) {
    inFlight.delete(threadId);
    return 0;
  }
  inFlight.set(threadId, count);
  return count;
};

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

interface ActionContext {
  readonly lists: ReturnType<typeof snapshotThreadLists>;
  readonly detail: ThreadDetail | undefined;
  readonly overlapped: boolean;
}

const rollback = (
  queryClient: QueryClient,
  threadId: ThreadId,
  context: ActionContext | undefined,
): void => {
  if (context === undefined || context.overlapped || inFlight.get(threadId) !== 1) {
    unsettledDetail.add(threadId);
    return;
  }
  restoreThreadInLists(queryClient, context.lists, threadId);
  queryClient.setQueryData(queryKeys.thread(threadId), context.detail);
};

const reconcileDetail = (queryClient: QueryClient, threadId: ThreadId): void => {
  if (track(threadId, -1) > 0) {
    return;
  }
  const key = queryKeys.thread(threadId);
  const stale = unsettledDetail.delete(threadId) || queryClient.isFetching({ queryKey: key }) > 0;
  if (!stale) {
    return;
  }
  void queryClient.invalidateQueries({ queryKey: key });
};

const applyOptimistic = (queryClient: QueryClient, threadId: ThreadId, action: ThreadAction) => {
  const detail = queryClient.getQueryData<ThreadDetail>(queryKeys.thread(threadId));
  const current = findCachedThread(queryClient, threadId) ?? detail?.thread ?? null;
  if (current === null) {
    return;
  }
  const next = projectThreadAction(current, action);
  writeThreadToLists(queryClient, next);
  if (detail !== undefined) {
    queryClient.setQueryData<ThreadDetail>(queryKeys.thread(threadId), { ...detail, thread: next });
  }
};

export const useThreadAction = (onError?: (error: unknown) => void) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, action }: ThreadActionInput) =>
      serialized(threadId, () => client.applyThreadAction(threadId, action)),
    onMutate: async ({ threadId, action }): Promise<ActionContext> => {
      const overlapped = track(threadId, 1) > 1;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.threadLists() }),
        queryClient.cancelQueries({ queryKey: queryKeys.thread(threadId) }),
      ]);
      const lists = snapshotThreadLists(queryClient);
      const detail = queryClient.getQueryData<ThreadDetail>(queryKeys.thread(threadId));
      applyOptimistic(queryClient, threadId, action);
      return { lists, detail, overlapped };
    },
    onError: (error, { threadId }, context) => {
      rollback(queryClient, threadId, context);
      onError?.(error);
    },
    onSuccess: (thread: ThreadSummary) => {
      writeThreadToLists(queryClient, thread);
      queryClient.setQueryData<ThreadDetail>(queryKeys.thread(thread.id), (detail) =>
        detail === undefined ? detail : { ...detail, thread },
      );
    },
    onSettled: (_thread, _error, { threadId }) => {
      reconcileDetail(queryClient, threadId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists() });
    },
  });
};
