import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { reconcileCachedAiJobs } from './ai-job-cache';
import { invalidateBatched } from './invalidation-batch';
import { queryKeys } from './query-keys';
import { applyRealtimeEvent } from './realtime-cache';
import { useClient } from './services-context';
import { taskSystemKeys } from './task-system-keys';

const RECONNECT_KEYS = [
  queryKeys.threadLists(),
  queryKeys.threadDetails(),
  queryKeys.taskLists(),
  queryKeys.drafts(),
  queryKeys.scheduled(),
  queryKeys.accounts(),
  queryKeys.splits(),
  queryKeys.automations(),
  queryKeys.settings(),
  queryKeys.allMailboxes(),
  queryKeys.labels(),
  taskSystemKeys.all(),
];

export const useRealtimeSync = (): void => {
  const client = useClient();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      client.subscribe((event) => {
        applyRealtimeEvent(queryClient, event);
      }),
    [client, queryClient],
  );
  useEffect(
    () =>
      client.onRealtimeConnected(() => {
        RECONNECT_KEYS.forEach((key) => {
          invalidateBatched(queryClient, key);
        });
        void reconcileCachedAiJobs(queryClient, client);
      }),
    [client, queryClient],
  );
};
