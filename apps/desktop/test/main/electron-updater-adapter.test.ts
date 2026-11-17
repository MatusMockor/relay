import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  ElectronUpdaterAdapter,
  type UpdaterLike,
  type UpdaterLogger,
} from '../../src/main/updates/electron-updater-adapter';
import { type RestartStrategy, UPDATER_RESTARTS } from '../../src/main/updates/restart-strategy';
import { createTestLogger } from './support/memory-log-sink';

type InstallOutcome = 'installed' | 'renamed' | 'fails';

class StubElectronUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  allowDowngrade = true;
  logger: UpdaterLogger | null = null;
  available: string | null = null;
  outcome: InstallOutcome = 'installed';
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

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const appImageRestart = (relaunched: string[]): RestartStrategy => ({
  kind: 'relaunch-after-exit',
  executable: '/home/jana/Apps/relay-0.1.0-x86_64-linux.AppImage',
  relaunch: (executable) => {
    relaunched.push(executable);
  },
});

const adapterFor = (stub: StubElectronUpdater, restart: RestartStrategy = UPDATER_RESTARTS) =>
  new ElectronUpdaterAdapter(stub, createTestLogger().logger, restart);

describe('ElectronUpdaterAdapter', () => {
  it('takes over downloads, installs on quit and never allows a downgrade', () => {
    const stub = new StubElectronUpdater();
    adapterFor(stub);
    expect(stub.autoDownload).toBe(false);
    expect(stub.autoInstallOnAppQuit).toBe(true);
    expect(stub.allowDowngrade).toBe(false);
    expect(stub.logger).not.toBeNull();
  });

  it('reports only a newer, well-formed version from the feed', async () => {
    const stub = new StubElectronUpdater();
    const adapter = adapterFor(stub);
    expect(await adapter.check()).toBeNull();
    stub.available = '0.2.0';
    expect(await adapter.check()).toEqual({ version: '0.2.0' });
    stub.available = 'not a version';
    await expect(adapter.check()).rejects.toThrow();
  });

  it('forwards download progress and stops listening afterwards', async () => {
    const stub = new StubElectronUpdater();
    const progress: number[] = [];
    await adapterFor(stub).download((percent) => {
      progress.push(percent);
    });
    expect(progress).toEqual([40, 100]);
    expect(stub.listenerCount('download-progress')).toBe(0);
  });

  it('lets Squirrel restart the app into the update', async () => {
    const stub = new StubElectronUpdater();
    let settled = false;
    void adapterFor(stub)
      .install()
      .finally(() => {
        settled = true;
      });
    await settle();
    expect(stub.quits).toEqual([[false, true]]);
    expect(settled).toBe(false);
  });

  it('rejects the install when the updater reports an error later', async () => {
    const stub = new StubElectronUpdater();
    const installing = adapterFor(stub).install();
    stub.emit('error', new Error('Could not get code signature for running application'));
    await expect(installing).rejects.toThrow('Could not get code signature');
  });

  it('installs the AppImage silently and relaunches it only after this instance exits', async () => {
    const stub = new StubElectronUpdater();
    stub.outcome = 'renamed';
    const relaunched: string[] = [];
    void adapterFor(stub, appImageRestart(relaunched)).install();
    await settle();
    expect(stub.quits).toEqual([[true, false]]);
    expect(relaunched).toEqual(['/home/jana/Apps/relay-0.2.0-x86_64-linux.AppImage']);
    expect(stub.listenerCount('appimage-filename-updated')).toBe(0);
  });

  it('does not relaunch when the AppImage could not be replaced', async () => {
    const stub = new StubElectronUpdater();
    stub.outcome = 'fails';
    const relaunched: string[] = [];
    await expect(adapterFor(stub, appImageRestart(relaunched)).install()).rejects.toThrow(
      'ERR_UPDATER_OLD_FILE_NOT_FOUND',
    );
    expect(relaunched).toEqual([]);
  });

  it('routes electron-updater logging into the app log', () => {
    const stub = new StubElectronUpdater();
    const { logger, sink } = createTestLogger();
    new ElectronUpdaterAdapter(stub, logger, UPDATER_RESTARTS);
    stub.logger?.info('Checking for update');
    stub.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
    expect(sink.messages()).toEqual([
      'electron-updater: Checking for update',
      'electron-updater emitted an error',
    ]);
  });
});
