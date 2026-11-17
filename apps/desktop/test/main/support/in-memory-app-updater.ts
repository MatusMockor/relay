import type {
  AppUpdater,
  AvailableUpdate,
  UpdaterFailureListener,
} from '../../../src/main/updates/app-updater';

interface PendingDownload {
  readonly onProgress: (percent: number) => void;
  readonly finish: () => void;
  readonly fail: (error: Error) => void;
}

export class InMemoryAppUpdater implements AppUpdater {
  checks = 0;
  installs = 0;
  private published: string | null = null;
  private checkFailure: Error | null = null;
  private installFailure: Error | null = null;
  private pending: PendingDownload | null = null;
  private readonly failureListeners: UpdaterFailureListener[] = [];

  publish(version: string): void {
    this.published = version;
  }

  failChecksWith(error: Error | null): void {
    this.checkFailure = error;
  }

  failInstallWith(error: Error): void {
    this.installFailure = error;
  }

  check(): Promise<AvailableUpdate | null> {
    this.checks += 1;
    if (this.checkFailure !== null) {
      return Promise.reject(this.checkFailure);
    }
    return Promise.resolve(this.published === null ? null : { version: this.published });
  }

  download(onProgress: (percent: number) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pending = { onProgress, finish: resolve, fail: reject };
    });
  }

  get downloading(): boolean {
    return this.pending !== null;
  }

  progress(percent: number): void {
    this.pending?.onProgress(percent);
  }

  completeDownload(): void {
    this.pending?.finish();
    this.pending = null;
  }

  failDownload(error: Error): void {
    this.pending?.fail(error);
    this.pending = null;
  }

  onFailure(listener: UpdaterFailureListener): void {
    this.failureListeners.push(listener);
  }

  reportFailure(error: Error): void {
    for (const listener of this.failureListeners) {
      listener(error);
    }
  }

  install(): Promise<void> {
    this.installs += 1;
    if (this.installFailure !== null) {
      return Promise.reject(this.installFailure);
    }
    return new Promise<void>(() => undefined);
  }
}
