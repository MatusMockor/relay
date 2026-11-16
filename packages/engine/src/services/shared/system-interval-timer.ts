import type { IntervalTask, IntervalTimer } from '../../ports/interval-timer';

export const systemIntervalTimer: IntervalTimer = {
  repeat(intervalMs: number, task: IntervalTask): () => void {
    const handle = setInterval(() => {
      void task();
    }, intervalMs);
    handle.unref();
    return () => {
      clearInterval(handle);
    };
  },
};
