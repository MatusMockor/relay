import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import appIcon from '../../resources/icon.png?asset';
import { createRemoteAiSupervisor } from './ai/remote/create-remote-ai-supervisor';
import { ModeAwareBackground } from './background/mode-aware-background';
import { createMainLogger } from './bootstrap/create-logger';
import { electronLocalPaths, electronPlatform } from './bootstrap/electron-platform';
import { electronAppUpdates } from './bootstrap/electron-updates';
import { MainWindowController } from './bootstrap/main-window-controller';
import { electronMcpEntry } from './bootstrap/mcp-entry';
import { startNativeShell } from './bootstrap/native-shell';
import { createQuitGuard } from './bootstrap/quit-guard';
import { reportFatalError } from './bootstrap/report-fatal-error';
import { composeIpc } from './composition/compose-ipc';
import { createLocalRuntime } from './composition/local-runtime';
import { bakedGoogleClient } from './oauth/baked-google-client';
import { AttachmentPicker } from './files/attachment-picker';
import { ElectronFileDialog } from './files/electron-file-dialog';
import { PickedFileReader } from './files/picked-file-reader';
import { systemClock } from './infra/system-clock';
import { registerIpc } from './ipc/register-ipc';
import { createTrustedSenderPredicate } from './ipc/trusted-sender';
import { acquireSingleInstance } from './native/single-instance';
import { restoreWindowState, trackWindowState } from './native/track-window-state';
import { WindowStateStore } from './native/window-state-store';
import { systemTimers } from './platform/timers';
import { createAppDocumentPredicate } from './window/app-document';
import { createMainWindow } from './window/create-main-window';
import { hardenSession } from './window/harden-session';

const rendererFileUrl = new URL('../renderer/index.html', import.meta.url);
const rendererUrl = app.isPackaged ? null : (process.env.ELECTRON_RENDERER_URL ?? null);

const isAppUrl = createAppDocumentPredicate(rendererUrl, rendererFileUrl.href);

const SHUTDOWN_DEADLINE_MS = 10_000;

interface RunningApp {
  stop(): Promise<void>;
}

interface WindowsRef {
  current: MainWindowController | null;
}

const startApp = async (windowsRef: WindowsRef): Promise<RunningApp> => {
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
    bakedGoogleClient,
    mcpEntry: electronMcpEntry(),
    allowPlaintextMail: !app.isPackaged && process.env.RELAY_DEV_ALLOW_PLAINTEXT_MAIL === '1',
  });
  hardenSession(session.defaultSession);
  const updates = electronAppUpdates(logger);

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
      attachmentPicker: new AttachmentPicker(new ElectronFileDialog(), new PickedFileReader()),
      updates: updates.service,
    }),
    createTrustedSenderPredicate(rendererUrl, rendererFileUrl.href),
  );

  const windowState = new WindowStateStore(paths.windowState);
  const windows = new MainWindowController(async () => {
    const window = await createMainWindow({
      preloadPath: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      rendererUrl,
      rendererFile: fileURLToPath(rendererFileUrl),
      state: await restoreWindowState(windowState),
      opener: platform.opener,
      isAppUrl,
      icon: appIcon,
    });
    trackWindowState(window, windowState, logger);
    return window;
  });
  windowsRef.current = windows;

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
  updates.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windows.open().catch((error: unknown) => {
        logger.error('Failed to reopen the main window', { error });
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  return {
    stop: async () => {
      updates.stop();
      unregisterIpc();
      shell.dispose();
      await Promise.all([background.stop(), remoteAi.stop()])
        .then(() => runtime.close())
        .catch((error: unknown) => {
          logger.error('Shutdown failed', { error });
        });
    },
  };
};

const runMain = (): void => {
  const windowsRef: WindowsRef = { current: null };
  const focusExisting = () => {
    windowsRef.current?.focus().catch((error: unknown) => {
      console.error('Relay could not show its window', error);
    });
  };
  if (!acquireSingleInstance(focusExisting)) {
    app.quit();
    return;
  }
  const running = startApp(windowsRef);
  app.on(
    'will-quit',
    createQuitGuard({
      teardown: async () => {
        await (await running).stop();
      },
      exit: () => {
        app.exit(0);
      },
      timers: systemTimers,
      deadlineMs: SHUTDOWN_DEADLINE_MS,
      onTimeout: () => {
        console.error('Relay shutdown did not finish in time, exiting anyway');
      },
    }),
  );
  running.catch(reportFatalError);
};

runMain();
