import type { ThreadAiState, ThreadSummary } from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { systemTimeZone } from '../../features/calendar/calendar-time';
import { describeError } from '../errors';
import { showToast } from '../../state/toast-store';
import { withoutSettledJobs } from './ai-job-cache';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export interface ThreadSummaryRequest {
  readonly request: () => void;
  readonly requesting: boolean;
}

const merged = (current: ThreadAiState | undefined, requested: ThreadAiState): ThreadAiState => {
  const base = current ?? { pending: [], jobs: [] };
  const known = new Set(base.jobs.map((ref) => ref.jobId));
  return {
    pending: [...new Set([...base.pending, ...requested.pending])],
    jobs: [...base.jobs, ...requested.jobs.filter((ref) => !known.has(ref.jobId))],
  };
};

export const useThreadSummaryRequest = (thread: ThreadSummary): ThreadSummaryRequest => {
  const client = useClient();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (target: ThreadSummary) => client.requestThreadSummary(target.id, systemTimeZone()),
    onSuccess: (state, target) => {
      const requested = withoutSettledJobs(queryClient, state);
      queryClient.setQueryData<ThreadAiState>(
        queryKeys.threadAi(target.id, target.lastMessageAt),
        (current) => merged(current, requested),
      );
      if (requested.pending.includes('summary')) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.thread(target.id) });
    },
    onError: (error) => {
      showToast(`Zhrnutie sa nepodarilo vyžiadať: ${describeError(error)}`);
    },
  });
  return {
    request: () => {
      mutation.mutate(thread);
    },
    requesting: mutation.isPending && mutation.variables.id === thread.id,
  };
};
