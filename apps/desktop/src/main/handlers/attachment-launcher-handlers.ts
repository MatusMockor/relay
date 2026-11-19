import type { AttachmentLauncher } from '../files/attachment-launcher';
import type { IpcInvokeHandlers } from '../ipc/invoke-router';

export const createAttachmentLauncherHandlers = (
  launcher: AttachmentLauncher,
): IpcInvokeHandlers => ({
  'app.attachments.open': async (attachment) => {
    await launcher.open(attachment);
    return { ok: true };
  },
  'app.attachments.quickLook': async (attachment) => {
    await launcher.quickLook(attachment);
    return { ok: true };
  },
});
