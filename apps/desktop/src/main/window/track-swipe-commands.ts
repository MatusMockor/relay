import type { MenuCommand } from '@relay/shared/ipc';

export interface SwipeWindow {
  on(event: 'swipe', listener: (event: unknown, direction: string) => void): unknown;
}

const SWIPE_COMMANDS: ReadonlyMap<string, MenuCommand> = new Map([
  ['left', { command: 'navigate-back' }],
  ['right', { command: 'navigate-forward' }],
]);

export const trackSwipeCommands = (
  window: SwipeWindow,
  request: (command: MenuCommand) => void,
): void => {
  window.on('swipe', (_event, direction) => {
    const menuCommand = SWIPE_COMMANDS.get(direction);
    if (menuCommand === undefined) {
      return;
    }
    request(menuCommand);
  });
};
