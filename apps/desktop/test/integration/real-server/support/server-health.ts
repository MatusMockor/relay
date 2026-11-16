import { api, buildUrl, HealthResponseSchema } from '@relay/shared/api';
import type { ServerProcess } from './server-process';

export type Readiness = 'ready' | 'exited' | 'timeout';

const POLL_MS = 100;
const PROBE_TIMEOUT_MS = 1_000;

const isHealthy = async (baseUrl: string): Promise<boolean> => {
  const response = await fetch(buildUrl(baseUrl, api.health.get, {}), {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }).catch(() => null);
  if (response === null || !response.ok) {
    return false;
  }
  return HealthResponseSchema.safeParse(await response.json().catch(() => null)).success;
};

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const waitForHealth = async (
  baseUrl: string,
  server: ServerProcess,
  timeoutMs: number,
): Promise<Readiness> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.hasExited()) {
      return 'exited';
    }
    if (await isHealthy(baseUrl)) {
      return server.hasExited() ? 'exited' : 'ready';
    }
    await pause(POLL_MS);
  }
  return 'timeout';
};
