import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

type ThreadServices = Pick<
  EngineServices,
  'inbox' | 'threads' | 'threadAi' | 'actions' | 'labels' | 'checklist'
>;

export const createThreadHandlers = (
  services: ThreadServices,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.threads.list': (query) => services.inbox.list(userId, query),
  'local.threads.get': ({ threadId }) => services.threads.getDetail(userId, threadId),
  'local.threads.prepareAi': ({ threadId, timeZone }) =>
    services.threadAi.prepare(userId, threadId, timeZone),
  'local.threads.action': ({ threadId, action }) =>
    services.actions.apply(userId, threadId, action),
  'local.threads.updateChecklist': ({ threadId, item }) =>
    services.checklist.update(userId, threadId, item),
  'local.labels.list': (query) => services.labels.list(userId, query),
});
