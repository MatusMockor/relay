import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

type ThreadServices = Pick<
  EngineServices,
  'inbox' | 'threads' | 'threadAi' | 'actions' | 'folderRead' | 'checklist' | 'unsubscribe'
>;

export const createThreadHandlers = (
  services: ThreadServices,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.threads.list': (query) => services.inbox.list(userId, query),
  'local.threads.get': ({ threadId }) => services.threads.getDetail(userId, threadId),
  'local.threads.prepareAi': ({ threadId, timeZone }) =>
    services.threadAi.prepare(userId, threadId, timeZone),
  'local.threads.requestSummary': ({ threadId, timeZone }) =>
    services.threadAi.requestSummary(userId, threadId, timeZone),
  'local.threads.action': ({ threadId, action }) =>
    services.actions.apply(userId, threadId, action),
  'local.threads.markFolderRead': (folder) => services.folderRead.markAllRead(userId, folder),
  'local.threads.updateChecklist': ({ threadId, item }) =>
    services.checklist.update(userId, threadId, item),
  'local.threads.unsubscribeOptions': ({ threadId }) =>
    services.unsubscribe.options(userId, threadId),
  'local.threads.unsubscribe': async ({ threadId, url }) => {
    await services.unsubscribe.unsubscribe(userId, threadId, url);
    return { ok: true } as const;
  },
});
