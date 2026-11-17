import type { AppUpdater, AvailableUpdate } from './app-updater';

export class LazyAppUpdater implements AppUpdater {
  private loaded: Promise<AppUpdater> | null = null;
  private resolved: AppUpdater | null = null;

  constructor(private readonly load: () => Promise<AppUpdater>) {}

  async check(): Promise<AvailableUpdate | null> {
    return (await this.updater()).check();
  }

  async download(onProgress: (percent: number) => void): Promise<void> {
    await (await this.updater()).download(onProgress);
  }

  install(): Promise<void> {
    if (this.resolved === null) {
      return Promise.reject(new Error('The updater has not been loaded yet'));
    }
    return this.resolved.install();
  }

  private updater(): Promise<AppUpdater> {
    this.loaded ??= this.load().then(
      (updater) => {
        this.resolved = updater;
        return updater;
      },
      (error: unknown) => {
        this.loaded = null;
        throw error;
      },
    );
    return this.loaded;
  }
}
