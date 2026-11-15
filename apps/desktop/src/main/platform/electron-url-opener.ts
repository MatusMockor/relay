import { shell } from 'electron';
import type { UrlOpener } from './url-opener';

export class ElectronUrlOpener implements UrlOpener {
  async open(url: string): Promise<void> {
    await shell.openExternal(url);
  }
}
