import { failureTitle } from './update-status-view';
import type { SettledCheck } from './update-check-state';

export const UP_TO_DATE = 'Máš najnovšiu verziu';

export const checkFeedback = (settled: SettledCheck | null): string | null => {
  if (settled === null) {
    return null;
  }
  if (settled.kind === 'error') {
    return failureTitle(settled.failed);
  }
  return UP_TO_DATE;
};
