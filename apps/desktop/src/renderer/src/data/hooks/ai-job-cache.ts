import type { AiJob, AiJobId, ThreadAiJobRef, ThreadAiState } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import type { MailClient } from '../MailClient';
import { queryKeys } from './query-keys';

type ThreadAiJob = AiJob & { readonly kind: 'summary' | 'replySuggestions' };

const settledJobs = new WeakMap<QueryClient, Set<AiJobId>>();

const settledOf = (client: QueryClient): Set<AiJobId> => {
  const existing = settledJobs.get(client);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Set<AiJobId>();
  settledJobs.set(client, created);
  return created;
};

const isThreadAiJob = (job: AiJob): job is ThreadAiJob =>
  job.kind === 'summary' || job.kind === 'replySuggestions';

const isSettled = (job: AiJob): boolean => job.status === 'done' || job.status === 'error';

const withoutJob = (state: ThreadAiState, job: ThreadAiJob): ThreadAiState => {
  const tracked = state.jobs.filter((ref) => ref.kind === job.kind);
  if (tracked.length > 0 && !tracked.some((ref) => ref.jobId === job.id)) {
    return state;
  }
  return {
    pending: state.pending.filter((kind) => kind !== job.kind),
    jobs: state.jobs.filter((ref) => ref.jobId !== job.id),
  };
};

export const applyAiJobUpdate = (client: QueryClient, job: AiJob): void => {
  if (!isThreadAiJob(job) || !isSettled(job) || job.input.kind !== job.kind) {
    return;
  }
  settledOf(client).add(job.id);
  client.setQueriesData<ThreadAiState>(
    { queryKey: queryKeys.threadAiOf(job.input.threadId) },
    (state) => (state === undefined ? state : withoutJob(state, job)),
  );
  if (job.status === 'done') {
    void client.invalidateQueries({ queryKey: queryKeys.thread(job.input.threadId) });
  }
};

export const withoutSettledJobs = (client: QueryClient, state: ThreadAiState): ThreadAiState => {
  const settled = settledOf(client);
  const finished = new Set(
    state.jobs.filter((ref) => settled.has(ref.jobId)).map((ref) => ref.kind),
  );
  return {
    pending: state.pending.filter((kind) => !finished.has(kind)),
    jobs: state.jobs.filter((ref) => !settled.has(ref.jobId)),
  };
};

export const reconcileAiJobs = async (
  client: QueryClient,
  mail: Pick<MailClient, 'getAiJob'>,
  refs: readonly ThreadAiJobRef[],
): Promise<void> => {
  const settled = settledOf(client);
  const open = refs.filter((ref) => !settled.has(ref.jobId));
  const jobs = await Promise.all(open.map((ref) => mail.getAiJob(ref.jobId).catch(() => null)));
  jobs.forEach((job) => {
    if (job !== null) {
      applyAiJobUpdate(client, job);
    }
  });
};

export const reconcileCachedAiJobs = (
  client: QueryClient,
  mail: Pick<MailClient, 'getAiJob'>,
): Promise<void> => {
  const refs = client
    .getQueriesData<ThreadAiState>({ queryKey: queryKeys.threadAiAll() })
    .flatMap(([, state]) => state?.jobs ?? []);
  return reconcileAiJobs(client, mail, refs);
};
