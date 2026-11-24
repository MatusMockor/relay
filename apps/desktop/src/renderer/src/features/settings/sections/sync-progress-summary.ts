import type { SyncStage } from '@relay/shared';
import type { SyncProgress } from '../../../data/hooks/use-sync-progress';
import { formatCount } from './history-summary';

export interface SyncProgressSummary {
  readonly text: string;
  readonly ratio: number;
}

const LABELS: Readonly<Record<SyncStage, (processed: string, total: string) => string>> = {
  headers: (processed, total) => `Načítavam zoznamy správ… ${processed} / ${total} priečinkov`,
  inbox: (processed, total) => `Sťahujem najnovšiu doručenú poštu… ${processed} / ${total}`,
  backlog: (processed, total) => `Sťahujem nedávnu poštu… ${processed} / ${total}`,
};

export const summarizeSyncProgress = (
  progress: SyncProgress | null,
): SyncProgressSummary | null => {
  const stage = progress?.stage;
  if (progress === null || stage === undefined || progress.total === null) {
    return null;
  }
  const { processed, total } = progress;
  return {
    text: LABELS[stage](formatCount(processed), formatCount(total)),
    ratio: total === 0 ? 0 : Math.min(1, processed / total),
  };
};
