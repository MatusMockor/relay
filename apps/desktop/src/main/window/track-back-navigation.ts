import type { MenuCommand } from '@relay/shared/ipc';

export interface AppCommandWindow {
  on(event: 'app-command', listener: (event: unknown, command: string) => void): unknown;
}

export const trackBackNavigation = (
  window: AppCommandWindow,
  request: (command: MenuCommand) => void,
): void => {
  window.on('app-command', (_event, command) => {
    if (command !== 'browser-backward') {
      return;
    }
    request({ command: 'navigate-back' });
  });
};
