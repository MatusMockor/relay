import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createSettingsHandlers = (
  services: Pick<EngineServices, 'settings' | 'splits' | 'automations'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.settings.get': () => services.settings.get(userId),
  'local.settings.update': (patch) => services.settings.update(userId, patch),
  'local.splits.list': () => services.splits.list(userId),
  'local.splits.replace': (body) => services.splits.replace(userId, body),
  'local.splits.preview': (body) => services.splits.preview(userId, body),
  'local.automations.list': () => services.automations.list(userId),
  'local.automations.replace': (body) => services.automations.replace(userId, body),
  'local.automations.restoreDefault': () => services.automations.restoreDefault(userId),
  'local.automations.preview': (body) => services.automations.preview(userId, body),
  'local.automations.apply': ({ automationId }) =>
    services.automations.applyToExisting(userId, automationId),
});
