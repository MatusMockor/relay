import { describe, expect, it } from 'vitest';
import { ElectronUpdaterAdapter } from '../../src/main/updates/electron-updater-adapter';
import {
  NATIVE_STAGING_TIMEOUT_MS,
  NativeStagingReadiness,
} from '../../src/main/updates/native-staging-readiness';
import { UPDATER_RESTARTS } from '../../src/main/updates/restart-strategy';
import { UpdateService } from '../../src/main/updates/update-service';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';
import { StubElectronUpdater, StubNativeUpdater } from './support/stub-electron-updater';

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const macDesktop = () => {
  const stub = new StubElectronUpdater();
  const native = new StubNativeUpdater();
  const time = new ManualTime();
  const logger = createTestLogger().logger;
  const readiness = new NativeStagingReadiness({
    native,
    updater: stub,
    timers: time,
    timeoutMs: NATIVE_STAGING_TIMEOUT_MS,
  });
  const updates = new UpdateService({
    updater: new ElectronUpdaterAdapter(stub, logger, UPDATER_RESTARTS, readiness),
    availability: { enabled: true },
    logger,
    timers: time,
  });
  stub.available = '0.2.0';
  return { stub, native, time, updates };
};

describe('macOS update staging', () => {
  it('offers the restart only once Squirrel.Mac staged the update', async () => {
    const { native, updates } = macDesktop();
    const checking = updates.check();
    await settle();
    expect(updates.status()).toEqual({ kind: 'downloading', version: '0.2.0', percent: 100 });
    native.stage();
    await checking;
    expect(updates.status()).toEqual({ kind: 'ready', version: '0.2.0' });
  });

  it('reports a failed download when staging fails and retries on the next check', async () => {
    const { native, updates } = macDesktop();
    const failing = updates.check();
    await settle();
    native.failStaging(new Error('Code signature at URL did not pass validation'));
    await failing;
    expect(updates.status()).toEqual({ kind: 'error', failed: 'download' });
    const retrying = updates.check();
    await settle();
    native.stage();
    await retrying;
    expect(updates.status()).toEqual({ kind: 'ready', version: '0.2.0' });
  });

  it('reports a failed download when staging never finishes', async () => {
    const { time, updates } = macDesktop();
    const checking = updates.check();
    await time.advance(NATIVE_STAGING_TIMEOUT_MS);
    await checking;
    expect(updates.status()).toEqual({ kind: 'error', failed: 'download' });
  });

  it('drops a staged update when the updater fails before the restart', async () => {
    const { native, stub, updates } = macDesktop();
    const checking = updates.check();
    await settle();
    native.stage();
    await checking;
    stub.emit('error', new Error('Squirrel.Mac lost the staged update'));
    expect(updates.status()).toEqual({ kind: 'error', failed: 'download' });
  });
});
