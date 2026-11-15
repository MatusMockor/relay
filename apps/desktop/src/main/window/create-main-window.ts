import { BrowserWindow, shell } from 'electron';

export interface MainWindowOptions {
  readonly preloadPath: string;
  readonly rendererUrl: string | null;
  readonly rendererFile: string;
}

const isSafeExternalUrl = (url: string): boolean => /^https:\/\//.test(url);

export const createMainWindow = async (options: MainWindowOptions): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d10',
    title: 'Relay',
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  if (options.rendererUrl !== null) {
    await window.loadURL(options.rendererUrl);
    return window;
  }
  await window.loadFile(options.rendererFile);
  return window;
};
