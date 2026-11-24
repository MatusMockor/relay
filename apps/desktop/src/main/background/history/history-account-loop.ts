import type { HistorySliceReport, Logger } from '@relay/engine';
import type { TimerHandle, Timers } from '../../platform/timers';
import {
  type HistoryCadence,
  type HistoryLoopState,
  type HistoryStep,
  stepAfterError,
  stepAfterReport,
} from './history-cadence';
import type { HistoryHold } from './history-holds';

export interface HistoryAccountLoopDeps {
  readonly slice: () => Promise<HistorySliceReport>;
  readonly cadence: HistoryCadence;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly onState: (state: HistoryLoopState) => void;
  readonly hold: HistoryHold;
  readonly onStep: (step: HistoryStep, failures: number) => void;
}

const coolingDown = (state: HistoryLoopState): boolean => state === 'paused' || state === 'error';

export class HistoryAccountLoop {
  private timer: TimerHandle | null = null;
  private current: Promise<void> | null = null;
  private active = false;
  private kicked = false;
  private failures: number;
  private status: HistoryLoopState;

  constructor(private readonly deps: HistoryAccountLoopDeps) {
    this.failures = deps.hold.failures;
    this.status = deps.hold.state;
  }

  get state(): HistoryLoopState {
    return this.status;
  }

  start(delayMs: number): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.schedule(delayMs);
  }

  kick(): void {
    if (!this.active || coolingDown(this.status)) {
      return;
    }
    if (this.current !== null) {
      this.kicked = true;
      return;
    }
    this.schedule(0);
  }

  stop(): void {
    this.active = false;
    this.timer?.cancel();
    this.timer = null;
  }

  idle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }

  private schedule(delayMs: number): void {
    this.timer?.cancel();
    this.timer = this.deps.timers.after(delayMs, () => {
      this.timer = null;
      this.current = this.execute().finally(() => {
        this.current = null;
      });
    });
  }

  private async execute(): Promise<void> {
    if (this.stopped()) {
      return;
    }
    const step = await Promise.resolve()
      .then(() => this.deps.slice())
      .then(
        (report) => this.succeeded(report),
        (error: unknown) => this.failed(error),
      );
    this.deps.onStep(step, this.failures);
    this.enter(step.state);
    const kicked = this.kicked;
    this.kicked = false;
    if (this.stopped() || step.delayMs === null) {
      return;
    }
    this.schedule(kicked && !coolingDown(step.state) ? 0 : step.delayMs);
  }

  private stopped(): boolean {
    return !this.active;
  }

  private succeeded(report: HistorySliceReport): HistoryStep {
    this.failures = 0;
    return stepAfterReport(this.deps.cadence, report);
  }

  private failed(error: unknown): HistoryStep {
    this.failures += 1;
    const step = stepAfterError(this.deps.cadence, error, this.failures);
    this.deps.logger.warn('History backfill slice failed', { delayMs: step.delayMs, error });
    return step;
  }

  private enter(state: HistoryLoopState): void {
    if (state === this.status) {
      return;
    }
    this.status = state;
    this.deps.onState(state);
  }
}
