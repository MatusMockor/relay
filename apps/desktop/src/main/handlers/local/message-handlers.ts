import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createMessageHandlers = (
  services: Pick<EngineServices, 'bodies'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.messages.body': ({ messageId }) => services.bodies.get(userId, messageId),
});
