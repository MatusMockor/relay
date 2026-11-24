export interface Spread {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

const round = (value: number): number => Math.round(value * 10) / 10;

export const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return round(sorted[index] ?? 0);
};

export const spreadOf = (values: readonly number[]): Spread => ({
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: percentile(values, 1),
});

export const timed = async <Result>(
  work: () => Promise<Result>,
): Promise<{ readonly result: Result; readonly ms: number }> => {
  const started = performance.now();
  const result = await work();
  return { result, ms: performance.now() - started };
};

export const warmMedian = async (work: () => Promise<unknown>, runs = 5): Promise<number> => {
  await work();
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    samples.push((await timed(work)).ms);
  }
  return percentile(samples, 0.5);
};

export const mib = (bytes: number): number => round(bytes / 1024 / 1024);
