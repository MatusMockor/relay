import type { ThreadAiKind, ThreadAiState, ThreadId } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { withoutSettledJobs } from './ai-job-cache';
import { queryKeys } from './query-keys';

const ON_DEMAND_KINDS: readonly ThreadAiKind[] = ['summary'];

const merged = (current: ThreadAiState | undefined, extra: ThreadAiState): ThreadAiState => {
  const jobs = new Map(
    [...(current?.jobs ?? []), ...extra.jobs].map((ref) => [ref.jobId, ref] as const),
  );
  return {
    pending: [...new Set([...(current?.pending ?? []), ...extra.pending])],
    jobs: [...jobs.values()],
  };
};

const cachedOnDemand = (client: QueryClient, threadId: ThreadId): ThreadAiState => {
  const jobs = client
    .getQueriesData<ThreadAiState>({ queryKey: queryKeys.threadAiOf(threadId) })
    .flatMap(([, state]) => state?.jobs ?? [])
    .filter((ref) => ON_DEMAND_KINDS.includes(ref.kind));
  return { pending: jobs.map((ref) => ref.kind), jobs };
};

export const withOnDemandJobs = (
  client: QueryClient,
  threadId: ThreadId,
  prepared: ThreadAiState,
): ThreadAiState => withoutSettledJobs(client, merged(prepared, cachedOnDemand(client, threadId)));

export const recordOnDemandJobs = (
  client: QueryClient,
  threadId: ThreadId,
  requested: ThreadAiState,
): ThreadAiState => {
  const fresh = withoutSettledJobs(client, requested);
  client.setQueriesData<ThreadAiState>({ queryKey: queryKeys.threadAiOf(threadId) }, (current) =>
    merged(current, fresh),
  );
  return fresh;
};
