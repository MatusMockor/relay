import type { GreenMailUser } from '@relay/config/test-infra';
import { ProviderError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImapMailProvider } from '../../src';
import { chunk } from '../../src/imap/uid-batches';
import { createGreenMailUser, deleteGreenMailUser } from '../support/greenmail';
import { RecordingClientFactory } from '../support/recording-client-factory';

const IDLE = {
  autoIdleDelayMs: 100,
  maxIdleTimeMs: 60_000,
  backoff: { initialMs: 50, maxMs: 200 },
};

describe('ImapMailProvider lifecycle', () => {
  let user: GreenMailUser;
  let factory: RecordingClientFactory;

  beforeEach(async () => {
    user = await createGreenMailUser();
    factory = new RecordingClientFactory(user);
  });

  afterEach(async () => {
    await deleteGreenMailUser(user);
  });

  it('disposes an IDLE watcher that is still starting when the provider closes', async () => {
    const provider = new ImapMailProvider(factory, { idle: IDLE });

    const starting = provider.idle('INBOX', () => undefined);
    await provider.close();
    await starting.catch(() => undefined);

    expect(factory.created.length).toBeGreaterThan(0);
    expect(factory.created.every((client) => !client.usable)).toBe(true);
  });

  it('disposes an IDLE watcher whose start fails', async () => {
    const provider = new ImapMailProvider(factory, { idle: IDLE });

    await expect(provider.idle('Missing', () => undefined)).rejects.toBeInstanceOf(ProviderError);

    expect(factory.created.every((client) => !client.usable)).toBe(true);
    await provider.close();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the fetch batch size %s',
    (size) => {
      expect(() => new ImapMailProvider(factory, { fetchBatchSize: size })).toThrow(RangeError);
      expect(() => chunk([1, 2, 3], size)).toThrow(RangeError);
    },
  );

  it('splits items into batches of a positive size', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});
