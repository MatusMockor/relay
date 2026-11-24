import type { HistoryDirection } from './navigation-history';

export type PressSource = 'pointer' | 'command';

interface Press {
  readonly source: PressSource;
  readonly at: number;
}

const PAIR_WINDOW_MS = 500;

const last = new Map<HistoryDirection, Press>();

export const claimHistoryPress = (
  direction: HistoryDirection,
  source: PressSource,
  now = Date.now(),
): boolean => {
  const previous = last.get(direction);
  if (previous !== undefined && previous.source !== source && now - previous.at < PAIR_WINDOW_MS) {
    last.delete(direction);
    return false;
  }
  last.set(direction, { source, at: now });
  return true;
};

export const resetHistoryPresses = (): void => {
  last.clear();
};
