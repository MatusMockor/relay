import { expect, onTestFinished } from 'vitest';
import type { DbExecutor } from '../../../src/persistence/database/database';
import { waitForLockWaiters } from './lock-holder';

export interface HeldTransaction<Result> {
  readonly result: Result;
  commit(): Promise<void>;
}

export const holdTransaction = async <Result>(
  db: DbExecutor,
  work: (tx: DbExecutor) => Promise<Result>,
): Promise<HeldTransaction<Result>> => {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = (_result: Result): void => undefined;
  const ready = new Promise<Result>((resolve) => {
    started = resolve;
  });
  const committed = db.transaction(async (tx) => {
    started(await work(tx));
    await gate;
  });
  const finished = committed.then(
    () => null,
    (error: unknown) => error,
  );
  onTestFinished(async () => {
    release();
    await finished;
  });
  const failedEarly = finished.then((error) => {
    expect(error).toBeNull();
    return ready;
  });
  const result = await Promise.race([ready, failedEarly]);
  return {
    result,
    commit: async () => {
      release();
      expect(await finished).toBeNull();
    },
  };
};

export const whileHeld = async <Held, Competing>(
  url: string,
  held: HeldTransaction<Held>,
  compete: () => Promise<Competing>,
): Promise<Competing> => {
  const competing = compete();
  const observed = competing.then(
    () => null,
    (error: unknown) => error,
  );
  try {
    await waitForLockWaiters(url);
  } finally {
    await held.commit();
  }
  expect(await observed).toBeNull();
  return competing;
};
