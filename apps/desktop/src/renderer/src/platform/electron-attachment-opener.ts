import type { IpcResult, RelayBridge } from '@relay/shared';
import { MailClientError } from '../data/errors';
import { readBlobBytes } from '../lib/read-blob';
import type { AttachmentOpener } from './attachment-opener';

const settle = async (result: Promise<IpcResult<unknown>>): Promise<void> => {
  const settled = await result;
  if (!settled.ok) {
    throw new MailClientError(settled.error);
  }
};

export const createElectronAttachmentOpener = (
  bridge: RelayBridge,
  quickLook: boolean,
): AttachmentOpener => ({
  quickLook,
  open: async (blob, filename) => {
    const content = await readBlobBytes(blob);
    await settle(bridge.invoke('app.attachments.open', { filename, content }));
  },
  showQuickLook: async (blob, filename) => {
    const content = await readBlobBytes(blob);
    await settle(bridge.invoke('app.attachments.quickLook', { filename, content }));
  },
});
