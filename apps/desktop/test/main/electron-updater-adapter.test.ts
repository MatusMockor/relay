import { describe, expect, it } from 'vitest';
import { ElectronUpdaterAdapter } from '../../src/main/updates/electron-updater-adapter';
import { DOWNLOAD_IS_READY } from '../../src/main/updates/install-readiness';
import {
  NATIVE_STAGING_TIMEOUT_MS,
  NativeStagingReadiness,
} from '../../src/main/updates/native-staging-readiness';
import { type RestartStrategy, UPDATER_RESTARTS } from '../../src/main/updates/restart-strategy';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';
import { StubElectronUpdater, StubNativeUpdater } from './support/stub-electron-updater';

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
  new ElectronUpdaterAdapter(stub, createTestLogger().logger, restart, DOWNLOAD_IS_READY);

const stagingAdapterFor = (stub: StubElectronUpdater) => {
  const native = new StubNativeUpdater();
  const time = new ManualTime();
  const readiness = new NativeStagingReadiness({
    native,
    updater: stub,
    timers: time,
    timeoutMs: NATIVE_STAGING_TIMEOUT_MS,
  });
  const adapter = new ElectronUpdaterAdapter(
    stub,
    createTestLogger().logger,
    UPDATER_RESTARTS,
    readiness,
  );
  return { adapter, native, time };
};

const track = (promise: Promise<void>) => {
  const state: { outcome: 'pending' | 'ready' | Error } = { outcome: 'pending' };
  promise.then(
    () => {
      state.outcome = 'ready';
    },
    (error: unknown) => {
      state.outcome = error instanceof Error ? error : new Error(String(error));
    },
  );
  return state;
};

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
    new ElectronUpdaterAdapter(stub, logger, UPDATER_RESTARTS, DOWNLOAD_IS_READY);
    stub.logger?.info('Checking for update');
    stub.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
    expect(sink.messages()).toEqual([
      'electron-updater: Checking for update',
      'electron-updater emitted an error',
    ]);
  });

  it('forwards updater errors to the failure listeners', () => {
    const stub = new StubElectronUpdater();
    const adapter = adapterFor(stub);
    const failures: string[] = [];
    adapter.onFailure((error) => {
      failures.push(error.message);
    });
    stub.emit('error', new Error('Code signature at URL did not pass validation'));
    expect(failures).toEqual(['Code signature at URL did not pass validation']);
  });

  describe('on macOS', () => {
    it('reports the download only after Squirrel.Mac staged the update', async () => {
      const stub = new StubElectronUpdater();
      const { adapter, native, time } = stagingAdapterFor(stub);
      const download = track(adapter.download(() => undefined));
      await settle();
      expect(download.outcome).toBe('pending');
      native.stage();
      await settle();
      expect(download.outcome).toBe('ready');
      expect(time.pendingCount).toBe(0);
      expect(native.listenerCount('update-downloaded')).toBe(0);
      expect(native.listenerCount('error')).toBe(0);
      expect(stub.listenerCount('update-downloaded')).toBe(0);
    });

    it('fails the download when Squirrel.Mac cannot stage it', async () => {
      const stub = new StubElectronUpdater();
      const { adapter, native, time } = stagingAdapterFor(stub);
      const download = adapter.download(() => undefined);
      await settle();
      native.failStaging(new Error('Code signature at URL did not pass validation'));
      await expect(download).rejects.toThrow('did not pass validation');
      expect(time.pendingCount).toBe(0);
    });

    it('fails the download when Squirrel.Mac never finishes staging', async () => {
      const stub = new StubElectronUpdater();
      const { adapter, native, time } = stagingAdapterFor(stub);
      const download = track(adapter.download(() => undefined));
      await time.advance(NATIVE_STAGING_TIMEOUT_MS - 1);
      expect(download.outcome).toBe('pending');
      await time.advance(1);
      expect(download.outcome).toBeInstanceOf(Error);
      expect(String(download.outcome)).toContain('did not stage the update');
      expect(native.listenerCount('update-downloaded')).toBe(0);
    });

    it('stops waiting for Squirrel.Mac when the download itself fails', async () => {
      const stub = new StubElectronUpdater();
      stub.downloadFailure = new Error('sha512 checksum mismatch');
      const { adapter, native, time } = stagingAdapterFor(stub);
      await expect(adapter.download(() => undefined)).rejects.toThrow('checksum mismatch');
      expect(time.pendingCount).toBe(0);
      expect(native.listenerCount('update-downloaded')).toBe(0);
      expect(native.listenerCount('error')).toBe(0);
    });
  });
});
