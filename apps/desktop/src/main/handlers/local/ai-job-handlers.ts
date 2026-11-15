import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createAiJobHandlers = (
  services: Pick<EngineServices, 'ai'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.ai.getJob': ({ jobId }) => services.ai.getJob(userId, jobId),
});
