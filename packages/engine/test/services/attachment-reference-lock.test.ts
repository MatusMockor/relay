import { describe, expect, it } from 'vitest';
import { AttachmentReferenceLock } from '../../src';

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('AttachmentReferenceLock', () => {
  it('runs shared work concurrently', async () => {
    const lock = new AttachmentReferenceLock();
    const gate = deferred();
    const order: string[] = [];

    const first = lock.shared(async () => {
      order.push('first');
      await gate.promise;
    });
    const second = lock.shared(() => {
      order.push('second');
      return Promise.resolve();
    });
    await second;
    expect(order).toEqual(['first', 'second']);
    gate.resolve();
    await first;
  });

  it('starts exclusive work after running shared work and holds later shared work back', async () => {
    const lock = new AttachmentReferenceLock();
    const sharedGate = deferred();
    const exclusiveGate = deferred();
    const order: string[] = [];

    const running = lock.shared(async () => {
      await sharedGate.promise;
      order.push('shared done');
    });
    const exclusive = lock.exclusive(async () => {
      order.push('exclusive start');
      await exclusiveGate.promise;
      order.push('exclusive done');
    });
    const later = lock.shared(() => {
      order.push('later shared');
      return Promise.resolve();
    });
    await tick();
    expect(order).toEqual([]);

    sharedGate.resolve();
    await tick();
    expect(order).toEqual(['shared done', 'exclusive start']);

    exclusiveGate.resolve();
    await Promise.all([running, exclusive, later]);
    expect(order).toEqual(['shared done', 'exclusive start', 'exclusive done', 'later shared']);
  });

  it('keeps working after failed work', async () => {
    const lock = new AttachmentReferenceLock();

    await expect(lock.exclusive(() => Promise.reject(new Error('disk')))).rejects.toThrow('disk');
    await expect(lock.shared(() => Promise.reject(new Error('db')))).rejects.toThrow('db');

    expect(await lock.exclusive(() => Promise.resolve('ok'))).toBe('ok');
    expect(await lock.shared(() => Promise.resolve('ok'))).toBe('ok');
  });
});
