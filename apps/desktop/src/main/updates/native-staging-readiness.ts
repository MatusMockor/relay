import type { TimerHandle, Timers } from '../platform/timers';
import type { InstallReadiness, ReadinessWatch } from './install-readiness';

type SignalListener = () => void;

type ErrorListener = (error: Error) => void;

export interface NativeUpdaterLike {
  on(event: 'update-downloaded', listener: SignalListener): unknown;
  on(event: 'error', listener: ErrorListener): unknown;
  removeListener(event: 'update-downloaded', listener: SignalListener): unknown;
  removeListener(event: 'error', listener: ErrorListener): unknown;
}

export interface DownloadSignal {
  on(event: 'update-downloaded', listener: SignalListener): unknown;
  removeListener(event: 'update-downloaded', listener: SignalListener): unknown;
}

export interface NativeStagingReadinessDeps {
  readonly native: NativeUpdaterLike;
  readonly updater: DownloadSignal;
  readonly timers: Timers;
  readonly timeoutMs: number;
}

export const NATIVE_STAGING_TIMEOUT_MS = 5 * 60_000;

class StagingWatch implements ReadinessWatch {
  readonly staged: Promise<void>;
  private timer: TimerHandle | null = null;
  private settled = false;
  private resolve: () => void = () => undefined;
  private reject: (error: Error) => void = () => undefined;

  constructor(private readonly deps: NativeStagingReadinessDeps) {
    this.staged = new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    deps.native.on('update-downloaded', this.done);
    deps.native.on('error', this.fail);
    deps.updater.on('update-downloaded', this.arm);
  }

  readonly arm = (): void => {
    if (this.settled || this.timer !== null) {
      return;
    }
    const { timers, timeoutMs } = this.deps;
    this.timer = timers.after(timeoutMs, () => {
      this.fail(new Error(`Squirrel.Mac did not stage the update within ${String(timeoutMs)} ms`));
    });
  };

  readonly cancel = (): void => {
    this.settle();
  };

  private readonly done = (): void => {
    if (this.settle()) {
      this.resolve();
    }
  };

  private readonly fail = (error: Error): void => {
    if (this.settle()) {
      this.reject(error);
    }
  };

  private settle(): boolean {
    if (this.settled) {
      return false;
    }
    this.settled = true;
    this.timer?.cancel();
    this.deps.native.removeListener('update-downloaded', this.done);
    this.deps.native.removeListener('error', this.fail);
    this.deps.updater.removeListener('update-downloaded', this.arm);
    return true;
  }
}

export class NativeStagingReadiness implements InstallReadiness {
  constructor(private readonly deps: NativeStagingReadinessDeps) {}

  watch(): ReadinessWatch {
    return new StagingWatch(this.deps);
  }
}
