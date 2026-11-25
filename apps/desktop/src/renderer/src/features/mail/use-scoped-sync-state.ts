import { useSyncProgress } from '../../data/hooks/use-sync-progress';
import { summarizeSyncProgress } from '../settings/sections/sync-progress-summary';
import { useAccountsModel } from './use-accounts-model';

export interface ScopedSyncBanner {
  readonly text: string;
  readonly ratio: number | null;
}

export interface ScopedSyncState {
  readonly isInitialSync: boolean;
  readonly accountName: string | null;
  readonly banner: ScopedSyncBanner | null;
}

const CONNECTING_TEXT = 'Pripájam sa a načítavam poštu…';

export const useScopedSyncState = (): ScopedSyncState => {
  const model = useAccountsModel();
  const scoped = model.current !== null ? [model.current] : model.accounts;
  const syncing =
    scoped.find((account) => account.status === 'syncing' && account.lastSyncedAt === null) ??
    scoped.find((account) => account.status === 'syncing') ??
    null;
  const progress = useSyncProgress(syncing?.id ?? null);
  const isInitialSync =
    syncing !== null && (syncing.lastSyncedAt === null || progress?.stage !== undefined);
  if (!isInitialSync) {
    return { isInitialSync: false, accountName: null, banner: null };
  }
  const summary = summarizeSyncProgress(progress);
  return {
    isInitialSync: true,
    accountName: syncing.displayName,
    banner: summary ?? { text: CONNECTING_TEXT, ratio: null },
  };
};
