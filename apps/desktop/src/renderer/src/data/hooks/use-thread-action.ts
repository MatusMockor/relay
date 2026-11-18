import type { ThreadAction, ThreadDetail, ThreadId, ThreadSummary } from '@relay/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ProjectionHint, projectThreadAction } from '../thread-projection';
import { queryKeys } from './query-keys';
import { serializedThreadAction } from './thread-action-queue';
import { useClient } from './services-context';
import {
  findCachedThread,
  restoreThreadInLists,
  snapshotThreadLists,
  writeThreadToLists,
} from './thread-cache';

interface ActionLedger {
  readonly inFlight: Map<ThreadId, number>;
  readonly unsettledDetail: Set<ThreadId>;
}

const ledgers = new WeakMap<QueryClient, ActionLedger>();

const ledgerOf = (queryClient: QueryClient): ActionLedger => {
  const existing = ledgers.get(queryClient);
  if (existing !== undefined) {
    return existing;
  }
  const created: ActionLedger = { inFlight: new Map(), unsettledDetail: new Set() };
  ledgers.set(queryClient, created);
  return created;
};

const track = (ledger: ActionLedger, threadId: ThreadId, delta: number): number => {
  const count = (ledger.inFlight.get(threadId) ?? 0) + delta;
  if (count <= 0) {
    ledger.inFlight.delete(threadId);
    return 0;
  }
  ledger.inFlight.set(threadId, count);
  return count;
};

export interface ThreadActionInput {
  readonly threadId: ThreadId;
  readonly action: ThreadAction;
  readonly hint?: ProjectionHint;
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
  const ledger = ledgerOf(queryClient);
  ledger.unsettledDetail.add(threadId);
  if (context === undefined || context.overlapped || ledger.inFlight.get(threadId) !== 1) {
    return;
  }
  restoreThreadInLists(queryClient, context.lists, threadId);
  const previous = context.detail;
  queryClient.setQueryData<ThreadDetail>(queryKeys.thread(threadId), (current) =>
    current === undefined || previous === undefined
      ? previous
      : { ...current, thread: previous.thread },
  );
};

const reconcileDetail = (queryClient: QueryClient, threadId: ThreadId): void => {
  const ledger = ledgerOf(queryClient);
  if (track(ledger, threadId, -1) > 0) {
    return;
  }
  const key = queryKeys.thread(threadId);
  const stale =
    ledger.unsettledDetail.delete(threadId) || queryClient.isFetching({ queryKey: key }) > 0;
  if (!stale) {
    return;
  }
  void queryClient.invalidateQueries({ queryKey: key });
};

const applyOptimistic = (
  queryClient: QueryClient,
  { threadId, action, hint }: ThreadActionInput,
) => {
  const detail = queryClient.getQueryData<ThreadDetail>(queryKeys.thread(threadId));
  const current = findCachedThread(queryClient, threadId) ?? detail?.thread ?? null;
  if (current === null) {
    return;
  }
  const next = projectThreadAction(current, action, hint);
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
      serializedThreadAction(client, threadId, () => client.applyThreadAction(threadId, action)),
    onMutate: async (input): Promise<ActionContext> => {
      const { threadId } = input;
      const ledger = ledgerOf(queryClient);
      const overlapped = track(ledger, threadId, 1) > 1;
      if (queryClient.isFetching({ queryKey: queryKeys.thread(threadId) }) > 0) {
        ledger.unsettledDetail.add(threadId);
      }
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.threadLists() }),
        queryClient.cancelQueries({ queryKey: queryKeys.thread(threadId) }),
      ]);
      const lists = snapshotThreadLists(queryClient);
      const detail = queryClient.getQueryData<ThreadDetail>(queryKeys.thread(threadId));
      applyOptimistic(queryClient, input);
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
