import type { MailboxSyncState } from '../../model/sync-state';

export const completedSyncState = (state: MailboxSyncState | null): MailboxSyncState | null => {
  if (state === null || state.initialWindow !== null) {
    return null;
  }
  return state;
};
