import type { PickedFiles } from '@relay/shared/ipc';
import type { FileDialog } from './file-dialog';
import type { PickedFileReader } from './picked-file-reader';

export class AttachmentPicker {
  constructor(
    private readonly dialog: FileDialog,
    private readonly reader: PickedFileReader,
  ) {}

  async pick(budgetBytes: number): Promise<PickedFiles> {
    const paths = await this.dialog.chooseFiles();
    return this.reader.read(paths, budgetBytes);
  }
}
