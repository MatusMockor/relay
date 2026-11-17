import { EventEmitter } from 'node:events';
import type {
  UpdaterLike,
  UpdaterLogger,
} from '../../../src/main/updates/electron-updater-adapter';

export type InstallOutcome = 'installed' | 'renamed' | 'fails';

export class StubElectronUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  allowDowngrade = true;
  logger: UpdaterLogger | null = null;
  available: string | null = null;
  outcome: InstallOutcome = 'installed';
  downloadFailure: Error | null = null;
  quits: (boolean | undefined)[][] = [];

  checkForUpdates() {
    const version = this.available;
    if (version === null) {
      return Promise.resolve({ isUpdateAvailable: false, updateInfo: { version: '0.1.0' } });
    }
    return Promise.resolve({ isUpdateAvailable: true, updateInfo: { version } });
  }

  downloadUpdate(): Promise<unknown> {
    this.emit('download-progress', { percent: 40 });
    this.emit('download-progress', { percent: 100 });
    if (this.downloadFailure !== null) {
      this.emit('error', this.downloadFailure);
      return Promise.reject(this.downloadFailure);
    }
    this.emit('update-downloaded', { version: this.available });
    return Promise.resolve(['/cache/relay-0.2.0-arm64-mac.zip']);
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.quits.push([isSilent, isForceRunAfter]);
    if (this.outcome === 'fails') {
      this.emit('error', new Error('ERR_UPDATER_OLD_FILE_NOT_FOUND'));
      return;
    }
    if (this.outcome === 'renamed') {
      this.emit('appimage-filename-updated', '/home/jana/Apps/relay-0.2.0-x86_64-linux.AppImage');
    }
  }
}

export class StubNativeUpdater extends EventEmitter {
  stage(): void {
    this.emit('update-downloaded');
  }

  failStaging(error: Error): void {
    this.emit('error', error);
  }
}
