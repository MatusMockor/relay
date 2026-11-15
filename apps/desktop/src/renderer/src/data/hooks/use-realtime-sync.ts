import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { reconcileCachedAiJobs } from './ai-job-cache';
import { applyRealtimeEvent } from './realtime-cache';
import { useClient } from './services-context';

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
        void reconcileCachedAiJobs(queryClient, client);
      }),
    [client, queryClient],
  );
};
