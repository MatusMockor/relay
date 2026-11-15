import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createSettingsHandlers = (
  services: Pick<EngineServices, 'settings' | 'splits'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.settings.get': () => services.settings.get(userId),
  'local.settings.update': (patch) => services.settings.update(userId, patch),
  'local.splits.list': () => services.splits.list(userId),
  'local.splits.replace': (body) => services.splits.replace(userId, body),
});
