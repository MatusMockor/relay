import type { ThemePreference } from '@relay/shared/domain';
import { BrowserWindow } from 'electron';
import type { UrlOpener } from '../platform/url-opener';
import type { WindowState } from '../native/window-bounds';
import { routeExternalLinks } from './route-external-links';
import { titleBarOptions } from './title-bar-options';
import { themeQuery, withThemeQuery } from './window-theme';

export interface MainWindowOptions {
  readonly preloadPath: string;
  readonly rendererUrl: string | null;
  readonly rendererFile: string;
  readonly state: WindowState;
  readonly opener: UrlOpener;
  readonly isAppUrl: (url: string) => boolean;
  readonly platform: NodeJS.Platform;
  readonly theme: ThemePreference;
  readonly backgroundColor: string;
  readonly icon?: string;
}

export const createMainWindow = async (options: MainWindowOptions): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    ...(options.state.x === undefined ? {} : { x: options.state.x }),
    ...(options.state.y === undefined ? {} : { y: options.state.y }),
    width: options.state.width,
    height: options.state.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: options.backgroundColor,
    title: 'Relay',
    ...titleBarOptions(options.platform),
    ...(options.icon === undefined ? {} : { icon: options.icon }),
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  });
  window.once('ready-to-show', () => {
    if (options.state.maximized) {
      window.maximize();
    }
    window.show();
  });
  routeExternalLinks(window.webContents, options.opener, options.isAppUrl);
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  if (options.rendererUrl !== null) {
    await window.loadURL(withThemeQuery(options.rendererUrl, options.theme));
    return window;
  }
  await window.loadFile(options.rendererFile, { query: themeQuery(options.theme) });
  return window;
};
