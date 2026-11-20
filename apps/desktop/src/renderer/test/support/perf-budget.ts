import { expect } from 'vitest';

const PERF_RUN = process.env.RELAY_PERF === '1';

export const expectWithinPerfBudget = (elapsedMs: number, budgetMs: number): void => {
  if (!PERF_RUN) {
    return;
  }
  expect(elapsedMs).toBeLessThan(budgetMs);
};
