import { readFileSync } from 'node:fs';
import type { FeedFetchOptions } from '@relay/calendar';

type Env = Readonly<Record<string, string | undefined>>;

export const calendarFetchEnv = (env: Env): Partial<FeedFetchOptions> => {
  const caFile = env.RELAY_CALENDAR_FEEDS_CA_FILE?.trim() ?? '';
  return {
    allowPrivateNetworks: env.RELAY_CALENDAR_FEEDS_ALLOW_PRIVATE_NETWORKS === 'true',
    ...(caFile === '' ? {} : { ca: readFileSync(caFile, 'utf8') }),
  };
};
