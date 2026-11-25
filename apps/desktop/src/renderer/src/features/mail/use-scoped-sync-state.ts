import type { MailAccount } from '@relay/shared';
import { type SyncProgress, useSyncProgresses } from '../../data/hooks/use-sync-progress';
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

interface SyncingAccount {
  readonly account: MailAccount;
  readonly progress: SyncProgress | null;
}

const CONNECTING_TEXT = 'Pripájam sa a načítavam poštu…';

const NOT_SYNCING: ScopedSyncState = { isInitialSync: false, accountName: null, banner: null };

const initialSyncOf = (syncing: readonly SyncingAccount[]): SyncingAccount | null =>
  syncing.find(({ progress }) => progress?.stage !== undefined) ??
  syncing.find(({ account }) => account.lastSyncedAt === null) ??
  null;

export const useScopedSyncState = (): ScopedSyncState => {
  const model = useAccountsModel();
  const scoped = model.current !== null ? [model.current] : model.accounts;
  const progresses = useSyncProgresses(scoped.map((account) => account.id));
  const syncing = scoped
    .map((account, index) => ({ account, progress: progresses[index] ?? null }))
    .filter(({ account }) => account.status === 'syncing');
  const chosen = initialSyncOf(syncing);
  if (chosen === null) {
    return NOT_SYNCING;
  }
  const summary = summarizeSyncProgress(chosen.progress);
  return {
    isInitialSync: true,
    accountName: chosen.account.displayName,
    banner: summary ?? { text: CONNECTING_TEXT, ratio: null },
  };
};
