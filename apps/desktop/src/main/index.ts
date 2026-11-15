import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import appIcon from '../../resources/icon.png?asset';
import { createRemoteAiSupervisor } from './ai/remote/create-remote-ai-supervisor';
import { ModeAwareBackground } from './background/mode-aware-background';
import { createMainLogger } from './bootstrap/create-logger';
import { electronLocalPaths, electronPlatform } from './bootstrap/electron-platform';
import { MainWindowController } from './bootstrap/main-window-controller';
import { electronMcpEntry } from './bootstrap/mcp-entry';
import { startNativeShell } from './bootstrap/native-shell';
import { reportFatalError } from './bootstrap/report-fatal-error';
import { composeIpc } from './composition/compose-ipc';
import { createLocalRuntime } from './composition/local-runtime';
import { systemClock } from './infra/system-clock';
import { registerIpc } from './ipc/register-ipc';
import { createTrustedSenderPredicate } from './ipc/trusted-sender';
import { acquireSingleInstance } from './native/single-instance';
import { restoreWindowState, trackWindowState } from './native/track-window-state';
import { WindowStateStore } from './native/window-state-store';
import { systemTimers } from './platform/timers';
import { createMainWindow } from './window/create-main-window';
import { hardenSession } from './window/harden-session';

const rendererFileUrl = new URL('../renderer/index.html', import.meta.url);
const rendererUrl = app.isPackaged ? null : (process.env.ELECTRON_RENDERER_URL ?? null);

const runMain = async (): Promise<void> => {
  let windows: MainWindowController | null = null;
  if (!acquireSingleInstance(() => void windows?.focus())) {
    app.quit();
    return;
  }

  await app.whenReady();

  const paths = electronLocalPaths();
  const logger = createMainLogger(paths.logFile, app.isPackaged);
  const platform = electronPlatform();
  const runtime = createLocalRuntime({
    paths,
    ...platform,
    timers: systemTimers,
    clock: systemClock,
    logger,
    env: process.env,
    mcpEntry: electronMcpEntry(),
    allowPlaintextMail: !app.isPackaged && process.env.RELAY_DEV_ALLOW_PLAINTEXT_MAIL === '1',
  });
  hardenSession(session.defaultSession);

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
      ...runtime.ipc,
    }),
    createTrustedSenderPredicate(rendererUrl, rendererFileUrl.href),
  );

  const windowState = new WindowStateStore(paths.windowState);
  windows = new MainWindowController(async () => {
    const window = await createMainWindow({
      preloadPath: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      rendererUrl,
      rendererFile: fileURLToPath(rendererFileUrl),
      state: await restoreWindowState(windowState),
      opener: platform.opener,
      icon: appIcon,
    });
    trackWindowState(window, windowState);
    return window;
  });

  const background = new ModeAwareBackground(
    runtime.infrastructure.deviceSettings,
    runtime.background,
    logger,
  );
  const remoteAi = createRemoteAiSupervisor({
    deviceSettings: runtime.infrastructure.deviceSettings,
    sessions: runtime.serverSessions,
    registry: runtime.aiRunners,
    clock: systemClock,
    timers: systemTimers,
    logger,
  });
  const shell = startNativeShell(runtime, windows, logger);
  await runtime.start();
  await windows.open();
  await background.start();
  await remoteAi.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void windows.open();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  let quitting = false;
  app.on('will-quit', (event) => {
    if (quitting) {
      return;
    }
    quitting = true;
    event.preventDefault();
    unregisterIpc();
    shell.dispose();
    void Promise.all([background.stop(), remoteAi.stop()])
      .then(() => runtime.close())
      .catch((error: unknown) => {
        logger.error('Shutdown failed', { error });
      })
      .finally(() => {
        app.exit(0);
      });
  });
};

runMain().catch(reportFatalError);
