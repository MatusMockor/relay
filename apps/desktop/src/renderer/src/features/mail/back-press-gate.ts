export type BackSource = 'pointer' | 'command';

const PAIR_WINDOW_MS = 500;

let last: { readonly source: BackSource; readonly at: number } | null = null;

export const claimBackPress = (source: BackSource, now = Date.now()): boolean => {
  if (last !== null && last.source !== source && now - last.at < PAIR_WINDOW_MS) {
    last = null;
    return false;
  }
  last = { source, at: now };
  return true;
};

export const resetBackPresses = (): void => {
  last = null;
};
