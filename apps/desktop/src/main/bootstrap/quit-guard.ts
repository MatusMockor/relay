import type { Timers } from '../platform/timers';

export interface QuitEvent {
  preventDefault(): void;
}

export interface QuitGuardOptions {
  readonly teardown: () => Promise<void>;
  readonly exit: () => void;
  readonly timers: Timers;
  readonly deadlineMs: number;
  readonly onTimeout: () => void;
}

const raceDeadline = (work: Promise<void>, options: QuitGuardOptions): Promise<void> =>
  new Promise((resolve) => {
    const deadline = options.timers.after(options.deadlineMs, () => {
      options.onTimeout();
      resolve();
    });
    void work.finally(() => {
      deadline.cancel();
      resolve();
    });
  });

export const createQuitGuard = (options: QuitGuardOptions): ((event: QuitEvent) => void) => {
  let quitting = false;
  return (event) => {
    event.preventDefault();
    if (quitting) {
      return;
    }
    quitting = true;
    const work = Promise.resolve()
      .then(options.teardown)
      .catch(() => undefined);
    void raceDeadline(work, options).then(options.exit);
  };
};
