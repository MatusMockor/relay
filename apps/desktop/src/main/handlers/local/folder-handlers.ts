import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createFolderHandlers = (
  services: Pick<EngineServices, 'folders'>,
  userId: UserId,
): IpcInvokeHandlers => {
  const { folders } = services;
  return {
    'local.mailboxes.create': ({ accountId, body }) => folders.create(userId, accountId, body),
    'local.mailboxes.update': ({ mailboxId, patch }) => folders.update(userId, mailboxId, patch),
    'local.mailboxes.delete': async ({ mailboxId }) => {
      await folders.remove(userId, mailboxId);
      return { ok: true };
    },
  };
};
