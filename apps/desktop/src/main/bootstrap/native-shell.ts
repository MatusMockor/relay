import type { Logger } from '@relay/engine';
import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { app } from 'electron';
import type { LocalRuntime } from '../composition/local-runtime';
import { MailboxUnreadSource } from '../native/mailbox-unread-source';
import { electronNotifications } from '../native/electron-notification-factory';
import { ElectronTrayView } from '../native/electron-tray';
import { installAppMenu } from '../native/install-app-menu';
import { NewMailNotifier } from '../native/new-mail-notifier';
import { SystemNotificationPresenter } from '../native/system-notification-presenter';
import { UnreadBadgeUpdater } from '../native/unread-badge-updater';
import { systemTimers } from '../platform/timers';
import type { MainWindowController } from './main-window-controller';

export interface NativeShell {
  dispose(): void;
}

export const startNativeShell = (
  runtime: LocalRuntime,
  windows: MainWindowController,
  logger: Logger,
): NativeShell => {
  const focus = () => {
    windows.focus().catch((error: unknown) => {
      logger.error('Failed to show the main window', { error });
    });
  };
  installAppMenu({
    platform: process.platform,
    appName: app.getName(),
    isDevelopment: !app.isPackaged,
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
  const presenter = new SystemNotificationPresenter(electronNotifications, focus);
  const notifier = new NewMailNotifier({
    hub,
    presenter,
    mode: async () => (await runtime.userSettings()).notifications,
    clock: runtime.infrastructure.clock,
    timers: systemTimers,
    logger,
  });
  badge.start();
  notifier.start();
  return {
    dispose: () => {
      notifier.stop();
      presenter.dispose();
      badge.stop();
      tray.destroy();
    },
  };
};
