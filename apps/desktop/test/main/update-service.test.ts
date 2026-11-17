import { ConflictError } from '@relay/engine';
import type { UpdateStatus } from '@relay/shared/ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UpdateAvailability } from '../../src/main/updates/update-availability';
import { UpdateService } from '../../src/main/updates/update-service';
import { InMemoryAppUpdater } from './support/in-memory-app-updater';
import { createTestLogger } from './support/memory-log-sink';

const ENABLED: UpdateAvailability = { enabled: true };

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('UpdateService', () => {
  let updater: InMemoryAppUpdater;
  let seen: UpdateStatus[];

  beforeEach(() => {
    updater = new InMemoryAppUpdater();
    seen = [];
  });

  const service = (availability: UpdateAvailability = ENABLED) => {
    const created = new UpdateService({
      updater,
      availability,
      logger: createTestLogger().logger,
    });
    created.changes.subscribe((status) => {
      seen.push(status);
    });
    return created;
  };

  const downloadUntilReady = async (updates: UpdateService) => {
    const checking = updates.check();
    await settle();
    updater.completeDownload();
    await checking;
  };

  it('stays disabled and never contacts the feed when updates are off', async () => {
    const updates = service({ enabled: false, reason: 'manual-package' });
    updater.publish('0.2.0');
    await updates.check();
    expect(updates.status()).toEqual({ kind: 'disabled', reason: 'manual-package' });
    expect(updater.checks).toBe(0);
  });

  it('stays idle when the feed has nothing newer', async () => {
    const updates = service();
    await updates.check();
    expect(updates.status()).toEqual({ kind: 'idle' });
    expect(updater.checks).toBe(1);
  });

  it('downloads a newer version in the background and reports the progress', async () => {
    const updates = service();
    updater.publish('0.2.0');
    const checking = updates.check();
    await settle();
    updater.progress(12.4);
    updater.progress(12.6);
    updater.progress(12.9);
    updater.progress(250);
    updater.completeDownload();
    await checking;
    expect(seen).toEqual([
      { kind: 'downloading', version: '0.2.0', percent: 0 },
      { kind: 'downloading', version: '0.2.0', percent: 12 },
      { kind: 'downloading', version: '0.2.0', percent: 13 },
      { kind: 'downloading', version: '0.2.0', percent: 100 },
      { kind: 'ready', version: '0.2.0' },
    ]);
  });

  it('runs one check at a time and skips checks once an update is downloaded', async () => {
    const updates = service();
    updater.publish('0.2.0');
    const first = updates.check();
    const second = updates.check();
    await settle();
    expect(updater.checks).toBe(1);
    updater.completeDownload();
    await Promise.all([first, second]);
    await updates.check();
    expect(updater.checks).toBe(1);
    expect(updates.status()).toEqual({ kind: 'ready', version: '0.2.0' });
  });

  it('reports a failed check and tries again on the next one', async () => {
    const updates = service();
    updater.failChecksWith(new Error('offline'));
    await updates.check();
    expect(updates.status()).toEqual({ kind: 'error', failed: 'check' });
    updater.failChecksWith(null);
    updater.publish('0.2.0');
    await downloadUntilReady(updates);
    expect(updates.status()).toEqual({ kind: 'ready', version: '0.2.0' });
  });

  it('reports a failed download', async () => {
    const updates = service();
    updater.publish('0.2.0');
    const checking = updates.check();
    await settle();
    updater.failDownload(new Error('sha512 checksum mismatch'));
    await checking;
    expect(updates.status()).toEqual({ kind: 'error', failed: 'download' });
  });

  it('refuses to install before an update is ready', async () => {
    const updates = service();
    await updates.check();
    expect(() => {
      updates.install();
    }).toThrow(ConflictError);
    expect(updater.installs).toBe(0);
  });

  it('restarts into the downloaded update', async () => {
    const updates = service();
    updater.publish('0.2.0');
    await downloadUntilReady(updates);
    updates.install();
    expect(updater.installs).toBe(1);
    expect(updates.status()).toEqual({ kind: 'installing', version: '0.2.0' });
  });

  it('reports an install that the updater rejects', async () => {
    const updates = service();
    updater.publish('0.2.0');
    await downloadUntilReady(updates);
    updater.failInstallWith(new Error('Squirrel could not verify the signature'));
    updates.install();
    expect(updates.status()).toEqual({ kind: 'installing', version: '0.2.0' });
    await settle();
    expect(updates.status()).toEqual({ kind: 'error', failed: 'install' });
    updater.publish('0.2.1');
    await downloadUntilReady(updates);
    expect(updates.status()).toEqual({ kind: 'ready', version: '0.2.1' });
  });
});
