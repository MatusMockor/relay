import { ProviderError } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export interface SyncTrigger {
  syncNow(accountId?: AccountId): Promise<void>;
}

export interface SyncOutcome {
  readonly ok: boolean;
  readonly error: string | null;
}

export const assertSynced = (reports: readonly SyncOutcome[]): void => {
  const failed = reports.find((report) => !report.ok);
  if (failed === undefined) {
    return;
  }
  throw new ProviderError(failed.error ?? 'Synchronizácia zlyhala');
};

export const createSyncHandlers = (trigger: SyncTrigger): IpcInvokeHandlers => ({
  'local.sync.now': async ({ accountId }) => {
    await trigger.syncNow(accountId);
    return { ok: true };
  },
});
