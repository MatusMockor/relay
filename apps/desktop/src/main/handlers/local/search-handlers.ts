import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createSearchHandlers = (
  services: Pick<EngineServices, 'search'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.search.server': (request) => services.search.search(userId, request),
});
