export interface TimerHandle {
  cancel(): void;
}

export interface Timers {
  after(delayMs: number, callback: () => void): TimerHandle;
}

export const systemTimers: Timers = {
  after: (delayMs, callback) => {
    const timeout = setTimeout(callback, delayMs);
    timeout.unref();
    return {
      cancel: () => {
        clearTimeout(timeout);
      },
    };
  },
};
