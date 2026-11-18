import type { TimerHandle, Timers } from '../platform/timers';

export const repeatEvery = (timers: Timers, intervalMs: number, tick: () => void): (() => void) => {
  let handle: TimerHandle | null = null;
  let stopped = false;
  const schedule = (): void => {
    handle = timers.after(intervalMs, () => {
      if (stopped) {
        return;
      }
      tick();
      schedule();
    });
  };
  schedule();
  return () => {
    stopped = true;
    handle?.cancel();
  };
};
