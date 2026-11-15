import { describe, expect, it } from 'vitest';
import { createQuitGuard } from '../../src/main/bootstrap/quit-guard';
import { ManualTime } from './support/manual-time';

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const quitEvent = () => {
  const event = { prevented: 0, preventDefault: () => (event.prevented += 1) };
  return event;
};

const setup = (teardown: () => Promise<void>) => {
  const time = new ManualTime();
  const events: string[] = [];
  let teardowns = 0;
  const guard = createQuitGuard({
    teardown: () => {
      teardowns += 1;
      return teardown();
    },
    exit: () => events.push('exit'),
    timers: time,
    deadlineMs: 10_000,
    onTimeout: () => events.push('timeout'),
  });
  return { time, events, guard, teardowns: () => teardowns };
};

describe('createQuitGuard', () => {
  it('holds every repeated quit request until the teardown finished, then exits once', async () => {
    const cleanup = deferred();
    const { time, events, guard, teardowns } = setup(() => cleanup.promise);
    const first = quitEvent();
    const second = quitEvent();

    guard(first);
    await time.advance(100);
    guard(second);
    await time.advance(100);

    expect([first.prevented, second.prevented]).toEqual([1, 1]);
    expect(teardowns()).toBe(1);
    expect(events).toEqual([]);
    cleanup.resolve();
    await time.advance(0);
    expect(events).toEqual(['exit']);
    expect(time.pendingCount).toBe(0);
  });

  it('exits after the deadline when the teardown never finishes', async () => {
    const { time, events, guard } = setup(() => new Promise<void>(() => undefined));

    guard(quitEvent());
    await time.advance(9_999);
    expect(events).toEqual([]);
    await time.advance(1);

    expect(events).toEqual(['timeout', 'exit']);
  });

  it('still exits when the teardown fails', async () => {
    const { time, events, guard } = setup(() => Promise.reject(new Error('database busy')));

    guard(quitEvent());
    await time.advance(0);

    expect(events).toEqual(['exit']);
  });
});
