import { MOD } from '../../lib/platform-keys';

export const ALL_ACCOUNTS_DIGIT = 0;
export const MAX_ACCOUNT_DIGIT = 9;

export const accountShortcutKeys = (all: boolean, index: number): string[] => {
  if (all) {
    return [`${MOD}${String(ALL_ACCOUNTS_DIGIT)}`];
  }
  if (index >= MAX_ACCOUNT_DIGIT) {
    return [];
  }
  return [`${MOD}${String(index + 1)}`];
};
