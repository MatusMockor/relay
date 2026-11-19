import { ProviderError } from '@relay/engine';
import { BrowserWindow, shell } from 'electron';
import type { FileViewer } from './file-viewer';

export class ElectronFileViewer implements FileViewer {
  constructor(private readonly platform: NodeJS.Platform) {}

  async open(path: string): Promise<void> {
    const failure = await shell.openPath(path);
    if (failure !== '') {
      throw new ProviderError(`Súbor sa nepodarilo otvoriť: ${failure}`);
    }
  }

  quickLook(path: string, displayName: string): Promise<void> {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (this.platform !== 'darwin' || window === undefined) {
      return Promise.reject(new ProviderError('Rýchly náhľad nie je dostupný.'));
    }
    window.previewFile(path, displayName);
    return Promise.resolve();
  }
}
