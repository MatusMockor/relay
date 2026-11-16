import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createDraftAttachmentHandlers = (
  services: Pick<EngineServices, 'compose'>,
  userId: UserId,
): IpcInvokeHandlers => {
  const { compose } = services;
  return {
    'local.drafts.attachments.add': ({ draftId, ...upload }) =>
      compose.addDraftAttachment(userId, draftId, upload),
    'local.drafts.attachments.remove': ({ draftId, attachmentId }) =>
      compose.removeDraftAttachment(userId, draftId, attachmentId),
    'local.drafts.attachments.forward': ({ draftId, messageId }) =>
      compose.forwardAttachments(userId, draftId, messageId),
  };
};
