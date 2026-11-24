import type { MenuCommand } from '@relay/shared/ipc';

export interface AppCommandWindow {
  on(event: 'app-command', listener: (event: unknown, command: string) => void): unknown;
}

const HISTORY_COMMANDS: Readonly<Record<string, MenuCommand>> = {
  'browser-backward': { command: 'navigate-back' },
  'browser-forward': { command: 'navigate-forward' },
};

export const trackHistoryCommands = (
  window: AppCommandWindow,
  request: (command: MenuCommand) => void,
): void => {
  window.on('app-command', (_event, command) => {
    const menuCommand = HISTORY_COMMANDS[command];
    if (menuCommand === undefined) {
      return;
    }
    request(menuCommand);
  });
};
