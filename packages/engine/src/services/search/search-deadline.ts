import type { IntervalTimer } from '../../ports/interval-timer';

export const EXPIRED: unique symbol = Symbol('expired');

export const raceDeadline = <Result>(
  timer: IntervalTimer,
  deadlineMs: number,
  work: Promise<Result>,
): Promise<Result | typeof EXPIRED> =>
  new Promise((resolve, reject) => {
    const stop = timer.repeat(deadlineMs, () => {
      stop();
      resolve(EXPIRED);
      return Promise.resolve();
    });
    work.then(
      (result) => {
        stop();
        resolve(result);
      },
      (error: unknown) => {
        stop();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
