export interface UidRange {
  readonly low: number;
  readonly high: number;
}

const byHighDescending = (left: UidRange, right: UidRange): number => right.high - left.high;

const appendDescending = (taken: number[], high: number, low: number): void => {
  for (let uid = high; uid >= low; uid -= 1) {
    taken.push(uid);
  }
};

export const newestUids = (ranges: readonly UidRange[], budget: number): number[] => {
  const taken: number[] = [];
  let ceiling = Number.POSITIVE_INFINITY;
  for (const range of [...ranges].sort(byHighDescending)) {
    const left = budget - taken.length;
    if (left <= 0) {
      break;
    }
    const high = Math.min(range.high, ceiling);
    const low = Math.max(range.low, high - left + 1);
    if (high < low) {
      continue;
    }
    appendDescending(taken, high, low);
    ceiling = low - 1;
  }
  return taken.reverse();
};
