import type { Logger } from '@relay/engine';
import { api, type ClaimedAiJob } from '@relay/shared/api';
import type { TimerHandle, Timers } from '../../platform/timers';
import { type WorkerApi, WorkerApiError } from './worker-api';

export interface LeaseHeartbeatDeps {
  readonly api: WorkerApi;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly intervalMs: number;
}

const lostLease = (error: unknown): boolean =>
  error instanceof WorkerApiError && (error.leaseLost || error.signedOut);

export const startLeaseHeartbeat = (
  deps: LeaseHeartbeatDeps,
  claim: ClaimedAiJob,
  onLost: () => void,
): TimerHandle => {
  let timer: TimerHandle | null = null;
  let active = true;
  const beat = async (): Promise<void> => {
    try {
      await deps.api.call(api.ai.heartbeatJob, {
        params: { id: claim.job.id },
        body: { leaseId: claim.leaseId },
      });
    } catch (error) {
      if (lostLease(error)) {
        deps.logger.warn('Remote AI job lost its lease', { jobId: claim.job.id });
        active = false;
        onLost();
        return;
      }
      deps.logger.warn('Remote AI heartbeat failed', { jobId: claim.job.id, error });
    }
    schedule();
  };
  const schedule = (): void => {
    if (!active) {
      return;
    }
    timer = deps.timers.after(deps.intervalMs, () => {
      void beat();
    });
  };
  schedule();
  return {
    cancel: () => {
      active = false;
      timer?.cancel();
    },
  };
};
