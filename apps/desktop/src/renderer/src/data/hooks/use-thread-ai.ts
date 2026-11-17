import type { ThreadAiKind, ThreadSummary } from '@relay/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { systemTimeZone } from '../../features/calendar/calendar-time';
import { reconcileAiJobs } from './ai-job-cache';
import { withOnDemandJobs } from './on-demand-ai-jobs';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

const NOTHING: readonly ThreadAiKind[] = [];

export const useThreadAiPending = (thread: ThreadSummary | null): readonly ThreadAiKind[] => {
  const client = useClient();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey:
      thread === null
        ? ['mail', 'threads', 'ai', 'none']
        : queryKeys.threadAi(thread.id, thread.lastMessageAt),
    queryFn: async () =>
      thread === null
        ? { pending: [], jobs: [] }
        : withOnDemandJobs(
            queryClient,
            thread.id,
            await client.prepareThreadAi(thread.id, systemTimeZone()),
          ),
    enabled: thread !== null,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const jobs = query.data?.jobs;
  useEffect(() => {
    if (jobs === undefined || jobs.length === 0) {
      return;
    }
    void reconcileAiJobs(queryClient, client, jobs);
  }, [jobs, queryClient, client]);
  return query.data?.pending ?? NOTHING;
};
