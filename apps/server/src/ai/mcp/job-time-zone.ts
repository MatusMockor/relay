import type { AiJob } from '@relay/shared/domain';

export const FALLBACK_TIME_ZONE = 'UTC';

export const jobTimeZone = (job: AiJob): string =>
  ('timeZone' in job.input ? job.input.timeZone : null) ?? FALLBACK_TIME_ZONE;
