import type { MailboxRole } from '@relay/shared/domain';

export interface HistoryOptions {
  readonly sliceMessages: number;
  readonly sliceMs: number;
  readonly batch: number;
  readonly sliceSearches: number;
}

export interface ReconcileOptions {
  readonly newestFlagUids: number;
  readonly rotatingFlagUids: number;
  readonly fullExpungeDiffMs: number;
}

export interface SyncOptions {
  readonly initialWindowDays: number;
  readonly initialMessageLimit: number;
  readonly initialFolderMessageLimit: number;
  readonly mailboxRoles: readonly MailboxRole[];
  readonly syncUnsubscribedFolders: boolean;
  readonly batchSize: number;
  readonly history: HistoryOptions;
  readonly reconcile: ReconcileOptions;
  readonly firstBatchSize: number;
}

export const DEFAULT_HISTORY_OPTIONS: HistoryOptions = {
  sliceMessages: 500,
  sliceMs: 15_000,
  batch: 100,
  sliceSearches: 64,
};

export const DEFAULT_RECONCILE_OPTIONS: ReconcileOptions = {
  newestFlagUids: 2_000,
  rotatingFlagUids: 2_000,
  fullExpungeDiffMs: 6 * 60 * 60_000,
};

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  initialWindowDays: 30,
  initialMessageLimit: 500,
  initialFolderMessageLimit: 200,
  mailboxRoles: ['inbox', 'sent', 'archive', 'trash', 'spam', 'custom'],
  syncUnsubscribedFolders: false,
  batchSize: 50,
  history: DEFAULT_HISTORY_OPTIONS,
  reconcile: DEFAULT_RECONCILE_OPTIONS,
  firstBatchSize: 15,
};
