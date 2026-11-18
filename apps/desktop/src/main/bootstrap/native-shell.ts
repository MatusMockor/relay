import type { Logger } from '@relay/engine';
import type { NotificationRequest } from '@relay/shared/ipc';
import type { EventHub } from '../events/event-hub';
import { app } from 'electron';
import type { LocalRuntime } from '../composition/local-runtime';
import { aboutPanelOptions } from '../native/about-panel';
import { AutomationNotifier } from '../native/automation-notifier';
import type { MenuCommandRequests } from '../native/menu-command-requests';
import { electronNotifications } from '../native/electron-notification-factory';
import { installAppMenu } from '../native/install-app-menu';
import { NewMailNotifier } from '../native/new-mail-notifier';
import { NotificationPause } from '../native/notification-pause';
import { PausableNotificationPresenter } from '../native/pausable-notification-presenter';
import type { RendererView } from '../native/renderer-view';
import { SessionNotificationRelay } from '../native/session-notification-relay';
import { SystemNotificationPresenter } from '../native/system-notification-presenter';
import type { ThreadOpenRequests } from '../native/thread-open-requests';
import { createUpdateCheckCommand, type UpdateChecker } from '../native/update-check-command';
import { systemTimers } from '../platform/timers';
import type { MainWindowController } from './main-window-controller';
import { startTrayShell } from './tray-shell';

export interface NativeShell {
  dispose(): void;
}

export interface NativeShellDeps {
  readonly runtime: LocalRuntime;
  readonly windows: MainWindowController;
  readonly threadOpens: ThreadOpenRequests;
  readonly menuCommands: MenuCommandRequests;
  readonly rendererView: RendererView;
  readonly rendererNotifications: EventHub<NotificationRequest>;
  readonly updates: UpdateChecker;
  readonly logger: Logger;
}

const installAboutPanel = (): void => {
  if (process.platform !== 'darwin') {
    return;
  }
  app.setAboutPanelOptions(aboutPanelOptions(app.getName(), app.getVersion()));
};

export const startNativeShell = (deps: NativeShellDeps): NativeShell => {
  const { runtime, windows, threadOpens, menuCommands, updates, logger } = deps;
  const focus = () => {
    windows.focus().catch((error: unknown) => {
      logger.error('Failed to show the main window', { error });
    });
  };
  const checkForUpdates = createUpdateCheckCommand({
    updates,
    showWindow: focus,
    openAbout: () => {
      menuCommands.request({ command: 'open-about' });
    },
    logger,
  });
  installAboutPanel();
  installAppMenu({
    platform: process.platform,
    appName: app.getName(),
    isDevelopment: !app.isPackaged,
    onCheckForUpdates: checkForUpdates,
  });
  const { hub, clock } = runtime.infrastructure;
  const pause = new NotificationPause(clock, systemTimers);
  const tray = startTrayShell({
    runtime,
    rendererView: deps.rendererView,
    pause,
    showWindow: focus,
    requestCommand: (command) => {
      menuCommands.request(command);
    },
    checkForUpdates,
    logger,
  });
  const system = new SystemNotificationPresenter(electronNotifications, focus, (threadId) => {
    threadOpens.request(threadId);
  });
  const presenter = new PausableNotificationPresenter(system, pause);
  const notifier = new NewMailNotifier({
    hub,
    presenter,
    mode: async () => (await runtime.userSettings()).notifications,
    clock,
    timers: systemTimers,
    logger,
  });
  const automations = new AutomationNotifier(hub, presenter);
  notifier.start();
  automations.start();
  const relay = new SessionNotificationRelay({
    view: deps.rendererView,
    gate: pause,
    createPresenter: (openThread) =>
      new SystemNotificationPresenter(electronNotifications, focus, openThread),
    openThread: (threadId) => {
      threadOpens.request(threadId);
    },
  });
  relay.start();
  const stopRelaying = deps.rendererNotifications.subscribe((request) => {
    relay.show(request);
  });
  return {
    dispose: () => {
      notifier.stop();
      automations.stop();
      stopRelaying();
      relay.stop();
      system.dispose();
      pause.dispose();
      tray.dispose();
    },
  };
};
