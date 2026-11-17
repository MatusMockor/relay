import { ConflictError, type Logger } from '@relay/engine';
import type { UpdateStatus } from '@relay/shared/ipc';
import { EventHub } from '../events/event-hub';
import type { AppUpdater } from './app-updater';
import type { UpdateAvailability } from './update-availability';

export interface UpdateServiceDeps {
  readonly updater: AppUpdater;
  readonly availability: UpdateAvailability;
  readonly logger: Logger;
}

const BUSY: ReadonlySet<UpdateStatus['kind']> = new Set([
  'disabled',
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

  constructor(private readonly deps: UpdateServiceDeps) {
    this.current = initialStatus(deps.availability);
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
    this.deps.updater.install().catch((error: unknown) => {
      this.deps.logger.error('The update could not be installed', { error });
      this.transition({ kind: 'error', failed: 'install' });
    });
  }

  private async checkAndDownload(): Promise<void> {
    const found = await this.deps.updater.check().catch((error: unknown) => {
      this.deps.logger.warn('The update check failed', { error });
      return 'failed' as const;
    });
    if (found === 'failed') {
      this.transition({ kind: 'error', failed: 'check' });
      return;
    }
    if (found === null) {
      this.transition({ kind: 'idle' });
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
