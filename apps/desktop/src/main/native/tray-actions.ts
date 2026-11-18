import type { MenuCommand } from '@relay/shared/ipc';
import type { NotificationPause } from './notification-pause';
import type { TrayAction } from './tray-menu-items';

export interface TrayActionDeps {
  readonly showWindow: () => void;
  readonly requestCommand: (command: MenuCommand) => void;
  readonly syncNow: () => void;
  readonly pause: Pick<NotificationPause, 'pause' | 'resume'>;
  readonly checkForUpdates: () => void;
  readonly quit: () => void;
}

const rendererCommandOf = (action: TrayAction): MenuCommand | null => {
  if (action.type === 'compose') {
    return { command: 'compose' };
  }
  if (action.type === 'select-scope') {
    return { command: 'select-scope', scope: action.scope };
  }
  if (action.type === 'open-settings') {
    return { command: 'open-settings', section: action.section };
  }
  if (action.type === 'open-about') {
    return { command: 'open-about' };
  }
  return null;
};

export const createTrayActionHandler =
  (deps: TrayActionDeps) =>
  (action: TrayAction): void => {
    const command = rendererCommandOf(action);
    if (command !== null) {
      deps.showWindow();
      deps.requestCommand(command);
      return;
    }
    if (action.type === 'show-window') {
      deps.showWindow();
      return;
    }
    if (action.type === 'sync-now') {
      deps.syncNow();
      return;
    }
    if (action.type === 'pause-notifications') {
      deps.pause.pause(action.duration);
      return;
    }
    if (action.type === 'resume-notifications') {
      deps.pause.resume();
      return;
    }
    if (action.type === 'check-updates') {
      deps.checkForUpdates();
      return;
    }
    deps.quit();
  };
