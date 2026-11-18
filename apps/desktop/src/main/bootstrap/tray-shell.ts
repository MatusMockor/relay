import type { Logger } from '@relay/engine';
import type { MenuCommand } from '@relay/shared/ipc';
import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { app } from 'electron';
import type { LocalRuntime } from '../composition/local-runtime';
import { totalUnread } from '../native/account-overview';
import { AccountOverviewUpdater } from '../native/account-overview-updater';
import { ElectronDotIcons } from '../native/electron-dot-icons';
import { ElectronTrayView } from '../native/electron-tray';
import { MailboxUnreadSource } from '../native/mailbox-unread-source';
import type { NotificationPause } from '../native/notification-pause';
import type { RendererView } from '../native/renderer-view';
import { repeatEvery } from '../native/repeat-every';
import { createTrayActionHandler } from '../native/tray-actions';
import { TrayMenu } from '../native/tray-menu';
import { trayMenuFeaturesOf } from '../native/tray-menu-features';
import { buildTrayTemplate } from '../native/tray-menu-template';
import { systemTimers } from '../platform/timers';

const MENU_REFRESH_MS = 60_000;

export interface TrayShellDeps {
  readonly runtime: LocalRuntime;
  readonly rendererView: RendererView;
  readonly pause: NotificationPause;
  readonly showWindow: () => void;
  readonly requestCommand: (command: MenuCommand) => void;
  readonly checkForUpdates: () => void;
  readonly logger: Logger;
}

export interface TrayShell {
  dispose(): void;
}

const periodicRefresh = (refresh: () => void): (() => void) => {
  if (process.platform === 'darwin') {
    return () => undefined;
  }
  return repeatEvery(systemTimers, MENU_REFRESH_MS, refresh);
};

export const startTrayShell = (deps: TrayShellDeps): TrayShell => {
  const { runtime, logger } = deps;
  const menu = new TrayMenu({
    appName: app.getName(),
    clock: runtime.infrastructure.clock,
    view: deps.rendererView,
    pause: deps.pause,
  });
  const templateOptions = {
    features: trayMenuFeaturesOf(process.platform, process.getSystemVersion()),
    icons: new ElectronDotIcons(),
    dispatch: createTrayActionHandler({
      showWindow: deps.showWindow,
      requestCommand: deps.requestCommand,
      syncNow: () => {
        runtime.sync.syncNow().catch((error: unknown) => {
          logger.warn('Manual sync from the tray failed', { error });
        });
      },
      pause: deps.pause,
      checkForUpdates: deps.checkForUpdates,
      quit: () => {
        app.quit();
      },
    }),
  };
  const tray = new ElectronTrayView(process.platform, {
    showWindow: deps.showWindow,
    template: () => buildTrayTemplate(menu.items(), templateOptions),
  });
  const refresh = () => {
    tray.refreshMenu();
  };
  const unsubscribe = menu.changes.subscribe(refresh);
  const stopRefreshing = periodicRefresh(refresh);
  const overview = new AccountOverviewUpdater({
    hub: runtime.infrastructure.hub,
    source: new MailboxUnreadSource(runtime.engine.repositories, LOCAL_USER_ID),
    view: {
      show: (accounts) => {
        tray.setUnread(totalUnread(accounts));
        menu.show(accounts);
      },
    },
    timers: systemTimers,
    logger,
  });
  overview.start();
  return {
    dispose: () => {
      overview.stop();
      stopRefreshing();
      unsubscribe();
      menu.dispose();
      tray.destroy();
    },
  };
};
