import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../src';
import { backfillUntilDone } from '../support/history';
import {
  backfillAll,
  isRemote,
  newerThan,
  type OfflineSetup,
  setupOffline,
} from '../support/offline-window';
import { USER_ID } from '../support/test-engine';

const overQuota = (): Error =>
  Object.assign(new Error('Command failed'), { serverResponseCode: 'OVERQUOTA' });

const grownWindow = async (): Promise<OfflineSetup> => {
  const setup = await setupOffline('3m', { hydrateFetchBatch: 2 });
  await backfillAll(setup);
  setup.window.set('1y');
  return setup;
};

const remoteInWindow = (setup: OfflineSetup): number =>
  newerThan(setup.engine, '1y').filter(isRemote).length;

describe('offline window hydration throttling', () => {
  it('fails the slice when the server throttles body fetches and keeps the bodies due', async () => {
    const setup = await grownWindow();
    const { engine, seeded } = setup;
    const due = remoteInWindow(setup);
    const throttle = overQuota();
    seeded.server.interruptStreamAfter = 1;
    seeded.server.interruptStreamError = throttle;

    const failure = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ cause: throttle });
    expect(remoteInWindow(setup)).toBe(due - 1);
    expect(
      engine.logger.entries.some((entry) => entry.message === 'Offline body hydration paused'),
    ).toBe(false);

    await backfillUntilDone(engine, seeded.account.id, 30);

    expect(remoteInWindow(setup)).toBe(0);
  });

  it('skips the batch and finishes the slice when a body fetch fails otherwise', async () => {
    const setup = await grownWindow();
    const { engine, seeded } = setup;
    seeded.server.interruptStreamAfter = 1;

    const report = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(report).toMatchObject({ skipped: false, more: false });
    expect(
      engine.logger.entries.some((entry) => entry.message === 'Offline body hydration paused'),
    ).toBe(true);
  });
});
