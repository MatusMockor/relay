import type { UidRange } from '../../../ports/mail-provider';

export const HISTORY_WINDOW_STEP = 2_000;
const GROWTH = 4;
const MAX_STEP = 256_000;

export interface HistoryWindow {
  readonly uids: readonly number[];
  readonly floor: number;
}

export interface HistoryUidSource {
  missing(range: UidRange): Promise<number[]>;
}

const search = async (
  source: HistoryUidSource,
  to: number,
  size: number,
): Promise<HistoryWindow> => {
  if (to < 1) {
    return { uids: [], floor: 1 };
  }
  const from = Math.max(1, to - size + 1);
  const missing = await source.missing({ from, to });
  if (missing.length > 0) {
    return { uids: [...missing].sort((left, right) => right - left), floor: from };
  }
  return search(source, from - 1, Math.min(size * GROWTH, MAX_STEP));
};

export const nextHistoryWindow = (
  source: HistoryUidSource,
  belowUid: number,
  step: number = HISTORY_WINDOW_STEP,
): Promise<HistoryWindow> => search(source, belowUid - 1, step);
