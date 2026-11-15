import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { composeIpc } from './composition/compose-ipc';
import { registerIpc } from './ipc/register-ipc';
import { createTrustedSenderPredicate } from './ipc/trusted-sender';
import { createMainWindow } from './window/create-main-window';

const rendererFileUrl = new URL('../renderer/index.html', import.meta.url);

const windowOptions = {
  preloadPath: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
  rendererUrl: app.isPackaged ? null : (process.env.ELECTRON_RENDERER_URL ?? null),
  rendererFile: fileURLToPath(rendererFileUrl),
};

const openMainWindow = async (): Promise<void> => {
  await createMainWindow(windowOptions);
};

await app.whenReady();

const unregisterIpc = registerIpc(
  ipcMain,
  composeIpc({
    app: {
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      electronVersion: process.versions.electron,
    },
  }),
  createTrustedSenderPredicate(windowOptions.rendererUrl, rendererFileUrl.href),
);

await openMainWindow();

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void openMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', unregisterIpc);
