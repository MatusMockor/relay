import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createAutomationHistoryHandlers = (
  services: Pick<EngineServices, 'automationHistory'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.automations.history': ({ automationId }) =>
    services.automationHistory.history(userId, automationId),
  'local.automations.undoActivity': ({ automationId, activityId }) =>
    services.automationHistory.undo(userId, automationId, activityId),
  'local.automations.undoSince': ({ automationId, since }) =>
    services.automationHistory.undoSince(userId, automationId, since),
});
