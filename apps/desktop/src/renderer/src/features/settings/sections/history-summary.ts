import type { HistoryProgress } from '@relay/shared';

export interface HistorySummary {
  readonly text: string;
  readonly ratio: number | null;
}

const numbers = new Intl.NumberFormat('sk-SK');

export const formatCount = (value: number): string => numbers.format(value);

const ratioOf = (stored: number, total: number): number =>
  total === 0 ? 0 : Math.min(1, stored / total);

export const summarizeHistory = (progress: readonly HistoryProgress[]): HistorySummary | null => {
  if (progress.length === 0) {
    return null;
  }
  if (progress.every((entry) => entry.state === 'done')) {
    return { text: 'Celá história je stiahnutá', ratio: null };
  }
  const stored = progress.reduce((sum, entry) => sum + entry.stored, 0);
  const total = progress.reduce((sum, entry) => sum + entry.total, 0);
  const running = progress.some((entry) => entry.state === 'running');
  if (!running && progress.some((entry) => entry.state === 'waiting')) {
    return { text: 'Začnem sťahovať po dokončení prvej synchronizácie', ratio: null };
  }
  if (!running) {
    return { text: 'Pozastavené, skúsim znova o chvíľu', ratio: ratioOf(stored, total) };
  }
  return {
    text: `Sťahujem históriu: ${formatCount(stored)} z ${formatCount(total)} správ`,
    ratio: ratioOf(stored, total),
  };
};
