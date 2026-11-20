import type { UidRange } from '../../../ports/mail-provider';

export const HISTORY_WINDOW_STEP = 2_000;
const GROWTH = 4;
const MAX_STEP = 256_000;

export type HistoryWindow =
  | { readonly kind: 'found'; readonly uids: readonly number[]; readonly range: UidRange }
  | { readonly kind: 'paused'; readonly belowUid: number }
  | { readonly kind: 'exhausted' };

export interface HistoryUidSource {
  missing(range: UidRange): Promise<number[]>;
}

export interface HistorySearchGate {
  canSearch(): boolean;
  searched(): void;
}

const search = async (
  source: HistoryUidSource,
  gate: HistorySearchGate,
  to: number,
  size: number,
): Promise<HistoryWindow> => {
  if (to < 1) {
    return { kind: 'exhausted' };
  }
  if (!gate.canSearch()) {
    return { kind: 'paused', belowUid: to + 1 };
  }
  const from = Math.max(1, to - size + 1);
  gate.searched();
  const missing = await source.missing({ from, to });
  if (missing.length > 0) {
    const uids = [...missing].sort((left, right) => right - left);
    return { kind: 'found', uids, range: { from, to } };
  }
  return search(source, gate, from - 1, Math.min(size * GROWTH, MAX_STEP));
};

export const nextHistoryWindow = (
  source: HistoryUidSource,
  gate: HistorySearchGate,
  belowUid: number,
  step: number = HISTORY_WINDOW_STEP,
): Promise<HistoryWindow> => search(source, gate, belowUid - 1, step);
