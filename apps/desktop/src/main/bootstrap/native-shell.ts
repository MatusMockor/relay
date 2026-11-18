import type { Logger } from '@relay/engine';
import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { app } from 'electron';
import type { LocalRuntime } from '../composition/local-runtime';
import { aboutPanelOptions } from '../native/about-panel';
import { AutomationNotifier } from '../native/automation-notifier';
import { MailboxUnreadSource } from '../native/mailbox-unread-source';
import type { MenuCommandRequests } from '../native/menu-command-requests';
import { electronNotifications } from '../native/electron-notification-factory';
import { ElectronTrayView } from '../native/electron-tray';
import { installAppMenu } from '../native/install-app-menu';
import { NewMailNotifier } from '../native/new-mail-notifier';
import { SystemNotificationPresenter } from '../native/system-notification-presenter';
import type { ThreadOpenRequests } from '../native/thread-open-requests';
import { UnreadBadgeUpdater } from '../native/unread-badge-updater';
import { createUpdateCheckCommand, type UpdateChecker } from '../native/update-check-command';
import { systemTimers } from '../platform/timers';
import type { MainWindowController } from './main-window-controller';

export interface NativeShell {
  dispose(): void;
}

export interface NativeShellDeps {
  readonly runtime: LocalRuntime;
  readonly windows: MainWindowController;
  readonly threadOpens: ThreadOpenRequests;
  readonly menuCommands: MenuCommandRequests;
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
  installAboutPanel();
  installAppMenu({
    platform: process.platform,
    appName: app.getName(),
    isDevelopment: !app.isPackaged,
    onCheckForUpdates: createUpdateCheckCommand({
      updates,
      showWindow: focus,
      openAbout: () => {
        menuCommands.request('open-about');
      },
      logger,
    }),
  });
  const tray = new ElectronTrayView(process.platform, {
    showWindow: focus,
    syncNow: () => {
      runtime.sync.syncNow().catch((error: unknown) => {
        logger.warn('Manual sync from the tray failed', { error });
      });
    },
    quit: () => {
      app.quit();
    },
  });
  const { hub } = runtime.infrastructure;
  const badge = new UnreadBadgeUpdater({
    hub,
    source: new MailboxUnreadSource(runtime.engine.repositories, LOCAL_USER_ID),
    view: tray,
    timers: systemTimers,
    logger,
  });
  const presenter = new SystemNotificationPresenter(electronNotifications, focus, (threadId) => {
    threadOpens.request(threadId);
  });
  const notifier = new NewMailNotifier({
    hub,
    presenter,
    mode: async () => (await runtime.userSettings()).notifications,
    clock: runtime.infrastructure.clock,
    timers: systemTimers,
    logger,
  });
  const automations = new AutomationNotifier(hub, presenter);
  badge.start();
  notifier.start();
  automations.start();
  return {
    dispose: () => {
      notifier.stop();
      automations.stop();
      presenter.dispose();
      badge.stop();
      tray.destroy();
    },
  };
};
