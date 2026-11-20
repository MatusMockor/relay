import { type HistorySliceReport, isThrottlingError } from '@relay/engine';
import { type BackoffPolicy, backoffDelayMs } from '../backoff';

export type HistoryLoopState = 'running' | 'idle' | 'paused' | 'error';

export interface HistoryCadence {
  readonly startDelayMs: number;
  readonly slicePauseMs: number;
  readonly busyRetryMs: number;
  readonly waitingMs: number;
  readonly recheckMs: number;
  readonly throttleMs: number;
  readonly backoff: BackoffPolicy;
}

export const DEFAULT_HISTORY_CADENCE: HistoryCadence = {
  startDelayMs: 10_000,
  slicePauseMs: 1_500,
  busyRetryMs: 5_000,
  waitingMs: 60_000,
  recheckMs: 15 * 60_000,
  throttleMs: 60 * 60_000,
  backoff: { initialMs: 30_000, maxMs: 30 * 60_000, factor: 2 },
};

export interface HistoryStep {
  readonly state: HistoryLoopState;
  readonly delayMs: number | null;
}

export const stepAfterReport = (
  cadence: HistoryCadence,
  report: HistorySliceReport,
): HistoryStep => {
  if (report.skipped) {
    return report.reason === 'busy'
      ? { state: 'running', delayMs: cadence.busyRetryMs }
      : { state: 'idle', delayMs: null };
  }
  if (report.more) {
    return { state: 'running', delayMs: cadence.slicePauseMs };
  }
  if (report.perMailbox.length === 0) {
    return { state: 'idle', delayMs: cadence.waitingMs };
  }
  return { state: 'idle', delayMs: cadence.recheckMs };
};

export const stepAfterError = (
  cadence: HistoryCadence,
  error: unknown,
  attempt: number,
): HistoryStep => {
  if (isThrottlingError(error)) {
    return { state: 'paused', delayMs: cadence.throttleMs };
  }
  return { state: 'error', delayMs: backoffDelayMs(cadence.backoff, attempt) };
};
