import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import { assertSynced, type SyncTrigger } from '../handlers/local/sync-handlers';

export const createLocalSyncTrigger = (
  services: Pick<EngineServices, 'sync'>,
  userId: UserId,
): SyncTrigger => ({
  syncNow: async (accountId) => {
    const reports =
      accountId === undefined
        ? await services.sync.syncUser(userId)
        : [await services.sync.syncAccount(userId, accountId)];
    assertSynced(reports);
  },
});
