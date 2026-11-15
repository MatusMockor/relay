import type { HexColor } from '@relay/shared/domain';

export const DEFAULT_SYNC_INTERVAL_SECONDS = 300;

const ACCOUNT_COLORS: readonly HexColor[] = [
  '#5b8def',
  '#e5735a',
  '#4fb286',
  '#c77dd8',
  '#e0b448',
  '#4bb3c4',
];

export const accountColor = (index: number): HexColor =>
  ACCOUNT_COLORS[index % ACCOUNT_COLORS.length] ?? '#5b8def';
