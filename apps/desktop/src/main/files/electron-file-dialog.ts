import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import type { FileDialog } from './file-dialog';

const OPTIONS: OpenDialogOptions = {
  title: 'Priložiť súbory',
  buttonLabel: 'Priložiť',
  properties: ['openFile', 'multiSelections'],
};

export class ElectronFileDialog implements FileDialog {
  async chooseFiles(): Promise<readonly string[]> {
    const parent = BrowserWindow.getFocusedWindow();
    const result =
      parent === null
        ? await dialog.showOpenDialog(OPTIONS)
        : await dialog.showOpenDialog(parent, OPTIONS);
    return result.canceled ? [] : result.filePaths;
  }
}
