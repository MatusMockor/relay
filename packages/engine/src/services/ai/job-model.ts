import type { AiJob, AiRunnerKind } from '@relay/shared/domain';

export const jobModelFor = (job: AiJob, runner: AiRunnerKind): string | null =>
  job.runner === runner ? (job.model ?? null) : null;
