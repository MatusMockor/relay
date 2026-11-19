import { join } from 'node:path';
import type { Logger } from '@relay/engine';
import { app } from 'electron';
import { AttachmentLauncher } from '../files/attachment-launcher';
import { AttachmentTempFiles } from '../files/attachment-temp-files';
import { ElectronFileViewer } from '../files/electron-file-viewer';
import { execFileRunner } from '../files/exec-file-runner';
import { XattrFileQuarantine } from '../files/xattr-file-quarantine';
import { systemClock } from '../infra/system-clock';

export const electronAttachmentLauncher = async (logger: Logger): Promise<AttachmentLauncher> => {
  const files = new AttachmentTempFiles(join(app.getPath('userData'), 'opened-attachments'));
  await files.clear().catch((error: unknown) => {
    logger.warn('Failed to clear opened attachment files', { error });
  });
  return new AttachmentLauncher(
    files,
    new ElectronFileViewer(process.platform),
    new XattrFileQuarantine(process.platform, app.getName(), execFileRunner, systemClock, logger),
  );
};
