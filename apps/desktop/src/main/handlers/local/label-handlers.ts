import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createLabelHandlers = (
  services: Pick<EngineServices, 'labels' | 'labelAdmin'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.labels.list': (query) => services.labels.list(userId, query),
  'local.labels.create': (body) => services.labelAdmin.create(userId, body),
  'local.labels.update': ({ labelId, patch }) => services.labelAdmin.update(userId, labelId, patch),
  'local.labels.delete': async ({ labelId }) => {
    await services.labelAdmin.remove(userId, labelId);
    return { ok: true } as const;
  },
});
