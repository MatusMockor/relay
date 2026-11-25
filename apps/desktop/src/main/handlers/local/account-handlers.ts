import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createAccountHandlers = (
  services: Pick<EngineServices, 'accounts' | 'accountOrder'>,
  userId: UserId,
): IpcInvokeHandlers => {
  const { accounts, accountOrder } = services;
  return {
    'local.accounts.list': () => accounts.list(userId),
    'local.accounts.create': (body) => accounts.create(userId, body),
    'local.accounts.update': ({ accountId, patch }) => accounts.update(userId, accountId, patch),
    'local.accounts.delete': async ({ accountId }) => {
      await accounts.remove(userId, accountId);
      return { ok: true };
    },
    'local.accounts.reorder': ({ accountIds }) => accountOrder.reorder(userId, accountIds),
    'local.accounts.testConnection': (body) => accounts.testConnection(body),
    'local.accounts.mailboxes': ({ accountId }) => accounts.mailboxes(userId, accountId),
  };
};
