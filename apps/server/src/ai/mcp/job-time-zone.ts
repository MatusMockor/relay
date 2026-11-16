import type { AiJob } from '@relay/shared/domain';

export const FALLBACK_TIME_ZONE = 'UTC';

export const jobTimeZone = (job: AiJob): string => {
  if (job.input.kind !== 'chatAnswer') {
    return FALLBACK_TIME_ZONE;
  }
  return job.input.timeZone ?? FALLBACK_TIME_ZONE;
};
