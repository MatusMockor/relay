import { ValidationError } from '@relay/engine';
import { canOpenAttachmentExternally } from '@relay/shared/domain';
import type { OpenAttachmentInput } from '@relay/shared/ipc';
import type { AttachmentTempFiles } from './attachment-temp-files';
import type { FileQuarantine } from './file-quarantine';
import type { FileViewer } from './file-viewer';

export class AttachmentLauncher {
  constructor(
    private readonly files: AttachmentTempFiles,
    private readonly viewer: FileViewer,
    private readonly quarantine: FileQuarantine,
  ) {}

  async open(attachment: OpenAttachmentInput): Promise<void> {
    if (!canOpenAttachmentExternally(attachment.filename)) {
      throw new ValidationError(
        'Tento typ súboru sa z bezpečnostných dôvodov nedá otvoriť priamo. Stiahni ho a otvor ručne.',
      );
    }
    const { path, marked } = await this.write(attachment);
    if (!marked) {
      throw new ValidationError(
        'Súbor sa nepodarilo bezpečne pripraviť na otvorenie. Stiahni ho a otvor ručne.',
      );
    }
    await this.viewer.open(path);
  }

  async quickLook(attachment: OpenAttachmentInput): Promise<void> {
    const { path } = await this.write(attachment);
    await this.viewer.quickLook(path, attachment.filename);
  }

  private async write(
    attachment: OpenAttachmentInput,
  ): Promise<{ readonly path: string; readonly marked: boolean }> {
    const path = await this.files.write(attachment.filename, attachment.content);
    return { path, marked: await this.quarantine.mark(path) };
  }
}
