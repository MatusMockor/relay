import type { HistoryCursor } from '../../../model/history-backfill';

export const historyComplete = (
  cursor: HistoryCursor | null,
  uidValidity: number | null,
): boolean =>
  cursor !== null &&
  uidValidity !== null &&
  cursor.doneAt !== null &&
  cursor.uidValidity === uidValidity;
