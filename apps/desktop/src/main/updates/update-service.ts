import { type Clock, ConflictError, type Logger } from '@relay/engine';
import type { UpdateStatus } from '@relay/shared/ipc';
import { EventHub } from '../events/event-hub';
import type { TimerHandle, Timers } from '../platform/timers';
import type { AppUpdater } from './app-updater';
import type { UpdateAvailability } from './update-availability';

export interface UpdateServiceDeps {
  readonly updater: AppUpdater;
  readonly availability: UpdateAvailability;
  readonly logger: Logger;
  readonly timers: Timers;
  readonly clock: Clock;
  readonly installTimeoutMs?: number;
}

export const INSTALL_TIMEOUT_MS = 2 * 60_000;

interface InstallAttempt {
  readonly watchdog: TimerHandle;
}

const BUSY: ReadonlySet<UpdateStatus['kind']> = new Set([
  'disabled',
  'checking',
  'downloading',
  'ready',
  'installing',
]);

const initialStatus = (availability: UpdateAvailability): UpdateStatus =>
  availability.enabled ? { kind: 'idle' } : { kind: 'disabled', reason: availability.reason };

const toPercent = (raw: number): number => Math.min(100, Math.max(0, Math.round(raw)));

export class UpdateService {
  readonly changes = new EventHub<UpdateStatus>();
  private current: UpdateStatus;
  private running: Promise<void> | null = null;
  private attempt: InstallAttempt | null = null;

  constructor(private readonly deps: UpdateServiceDeps) {
    this.current = initialStatus(deps.availability);
    deps.updater.onFailure((error) => {
      this.lateFailure(error);
    });
  }

  status(): UpdateStatus {
    return this.current;
  }

  check(): Promise<void> {
    if (this.running !== null) {
      return this.running;
    }
    if (BUSY.has(this.current.kind)) {
      return Promise.resolve();
    }
    this.running = this.checkAndDownload().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  install(): void {
    const current = this.current;
    if (current.kind !== 'ready') {
      throw new ConflictError('Aktualizácia ešte nie je pripravená');
    }
    this.deps.logger.info('Restarting to install an update', { version: current.version });
    this.transition({ kind: 'installing', version: current.version });
    const timeoutMs = this.deps.installTimeoutMs ?? INSTALL_TIMEOUT_MS;
    const attempt: InstallAttempt = {
      watchdog: this.deps.timers.after(timeoutMs, () => {
        this.failInstall(
          attempt,
          new Error(`The app did not restart within ${String(timeoutMs)} ms`),
        );
      }),
    };
    this.attempt = attempt;
    this.deps.updater.install().catch((error: unknown) => {
      this.failInstall(attempt, error);
    });
  }

  private failInstall(attempt: InstallAttempt, error: unknown): void {
    if (this.attempt !== attempt) {
      return;
    }
    attempt.watchdog.cancel();
    this.attempt = null;
    this.deps.logger.error('The update could not be installed', { error });
    this.transition({ kind: 'error', failed: 'install' });
  }

  private lateFailure(error: Error): void {
    if (this.attempt !== null) {
      this.failInstall(this.attempt, error);
      return;
    }
    if (this.current.kind !== 'ready') {
      return;
    }
    this.deps.logger.error('The downloaded update can no longer be installed', { error });
    this.transition({ kind: 'error', failed: 'download' });
  }

  private async checkAndDownload(): Promise<void> {
    this.transition({ kind: 'checking' });
    const found = await this.deps.updater.check().catch((error: unknown) => {
      this.deps.logger.warn('The update check failed', { error });
      return 'failed' as const;
    });
    if (found === 'failed') {
      this.transition({ kind: 'error', failed: 'check' });
      return;
    }
    if (found === null) {
      this.transition({ kind: 'current', checkedAt: this.deps.clock.now().toISOString() });
      return;
    }
    this.deps.logger.info('An update is available', { version: found.version });
    await this.download(found.version);
  }

  private async download(version: string): Promise<void> {
    this.transition({ kind: 'downloading', version, percent: 0 });
    try {
      await this.deps.updater.download((raw) => {
        this.progress(version, toPercent(raw));
      });
      this.transition({ kind: 'ready', version });
    } catch (error) {
      this.deps.logger.error('The update download failed', { error });
      this.transition({ kind: 'error', failed: 'download' });
    }
  }

  private progress(version: string, percent: number): void {
    if (this.current.kind !== 'downloading' || this.current.percent === percent) {
      return;
    }
    this.transition({ kind: 'downloading', version, percent });
  }

  private transition(next: UpdateStatus): void {
    this.current = next;
    this.changes.publish(next);
  }
}
