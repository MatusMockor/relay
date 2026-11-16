import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

const ok = { ok: true } as const;

export const createComposeHandlers = (
  services: Pick<EngineServices, 'compose'>,
  userId: UserId,
): IpcInvokeHandlers => {
  const { compose } = services;
  return {
    'local.drafts.list': () => compose.listDrafts(userId),
    'local.drafts.create': (body) => compose.createDraft(userId, body),
    'local.drafts.update': ({ draftId, patch }) => compose.updateDraft(userId, draftId, patch),
    'local.drafts.delete': async ({ draftId }) => {
      await compose.deleteDraft(userId, draftId);
      return ok;
    },
    'local.send': (body) => compose.send(userId, body),
    'local.scheduled.list': () => compose.listScheduled(userId),
    'local.scheduled.cancel': async ({ scheduledSendId }) => {
      await compose.cancelScheduled(userId, scheduledSendId);
      return ok;
    },
  };
};
