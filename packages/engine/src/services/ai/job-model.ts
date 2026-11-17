import type { AiEffort, AiJob, AiRunnerKind } from '@relay/shared/domain';

export interface JobModel {
  readonly model: string | null;
  readonly effort: AiEffort | null;
}

export const jobModelFor = (job: AiJob, runner: AiRunnerKind): JobModel =>
  job.runner === runner
    ? { model: job.model ?? null, effort: job.effort ?? null }
    : { model: null, effort: null };
