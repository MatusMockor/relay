import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createAttachmentHandlers = (
  services: Pick<EngineServices, 'attachments'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.attachments.content': async ({ attachmentId }) => {
    const found = await services.attachments.content(userId, attachmentId);
    return {
      filename: found.filename,
      contentType: found.contentType,
      contentBase64: Buffer.from(found.content).toString('base64'),
    };
  },
});
