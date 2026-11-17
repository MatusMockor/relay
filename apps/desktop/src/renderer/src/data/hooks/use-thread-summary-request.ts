import type { ThreadSummary } from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { systemTimeZone } from '../../features/calendar/calendar-time';
import { describeError } from '../errors';
import { showToast } from '../../state/toast-store';
import { recordOnDemandJobs } from './on-demand-ai-jobs';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export interface ThreadSummaryRequest {
  readonly request: () => void;
  readonly requesting: boolean;
}

export const useThreadSummaryRequest = (thread: ThreadSummary): ThreadSummaryRequest => {
  const client = useClient();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (target: ThreadSummary) => client.requestThreadSummary(target.id, systemTimeZone()),
    onSuccess: (state, target) => {
      if (recordOnDemandJobs(queryClient, target.id, state).pending.includes('summary')) {
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
