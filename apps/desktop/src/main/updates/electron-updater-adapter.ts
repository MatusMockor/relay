import type { Logger } from '@relay/engine';
import { UpdateVersionSchema } from '@relay/shared/ipc';
import type { AppUpdater, AvailableUpdate } from './app-updater';
import type { RestartStrategy } from './restart-strategy';

export interface UpdaterLogger {
  info(message?: unknown): void;
  warn(message?: unknown): void;
  error(message?: unknown): void;
  debug?(message: string): void;
}

interface CheckResult {
  readonly isUpdateAvailable: boolean;
  readonly updateInfo: { readonly version: string };
}

type ProgressListener = (info: { readonly percent: number }) => void;

type ErrorListener = (error: Error) => void;

type RenameListener = (path: string) => void;

export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  logger: UpdaterLogger | null;
  checkForUpdates(): Promise<CheckResult | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: 'download-progress', listener: ProgressListener): unknown;
  on(event: 'error', listener: ErrorListener): unknown;
  on(event: 'appimage-filename-updated', listener: RenameListener): unknown;
  removeListener(event: 'download-progress', listener: ProgressListener): unknown;
  removeListener(event: 'error', listener: ErrorListener): unknown;
  removeListener(event: 'appimage-filename-updated', listener: RenameListener): unknown;
}

const LOG_PREFIX = 'electron-updater';

export class ElectronUpdaterAdapter implements AppUpdater {
  constructor(
    private readonly updater: UpdaterLike,
    private readonly logger: Logger,
    private readonly restart: RestartStrategy,
  ) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.allowDowngrade = false;
    updater.logger = this.updaterLogger();
    updater.on('error', (error) => {
      logger.debug(`${LOG_PREFIX} emitted an error`, { error: error.message });
    });
  }

  async check(): Promise<AvailableUpdate | null> {
    const result = await this.updater.checkForUpdates();
    if (result === null || !result.isUpdateAvailable) {
      return null;
    }
    return { version: UpdateVersionSchema.parse(result.updateInfo.version) };
  }

  async download(onProgress: (percent: number) => void): Promise<void> {
    const progress: ProgressListener = (info) => {
      onProgress(info.percent);
    };
    this.updater.on('download-progress', progress);
    try {
      await this.updater.downloadUpdate();
    } finally {
      this.updater.removeListener('download-progress', progress);
    }
  }

  install(): Promise<void> {
    return new Promise<void>((_restarting, reject) => {
      const outcome: { failure: Error | null } = { failure: null };
      const fail: ErrorListener = (error) => {
        outcome.failure = error;
        this.updater.removeListener('error', fail);
        reject(error);
      };
      this.updater.on('error', fail);
      if (this.restart.kind === 'updater') {
        this.updater.quitAndInstall(false, true);
        return;
      }
      const executable = this.installSilently(this.restart.executable);
      if (outcome.failure !== null) {
        return;
      }
      this.restart.relaunch(executable);
    });
  }

  private installSilently(current: string): string {
    let executable = current;
    const renamed: RenameListener = (path) => {
      executable = path;
    };
    this.updater.on('appimage-filename-updated', renamed);
    try {
      this.updater.quitAndInstall(true, false);
    } finally {
      this.updater.removeListener('appimage-filename-updated', renamed);
    }
    return executable;
  }

  private updaterLogger(): UpdaterLogger {
    return {
      info: (message) => {
        this.logger.info(`${LOG_PREFIX}: ${String(message)}`);
      },
      warn: (message) => {
        this.logger.warn(`${LOG_PREFIX}: ${String(message)}`);
      },
      error: (message) => {
        this.logger.warn(`${LOG_PREFIX} reported an error`, { error: String(message) });
      },
    };
  }
}
