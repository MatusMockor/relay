import type { Logger } from '@relay/engine';
import { screen } from 'electron';
import { fitWindowState, type Rect, type WindowState } from './window-bounds';
import type { WindowStateStore } from './window-state-store';

const SAVE_DELAY_MS = 500;

export interface TrackedWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  isMaximized(): boolean;
  getNormalBounds(): Rect;
  on(event: 'resize' | 'move' | 'maximize' | 'unmaximize' | 'close', listener: () => void): unknown;
}

export const restoreWindowState = async (store: WindowStateStore): Promise<WindowState> =>
  fitWindowState(
    await store.load(),
    screen.getAllDisplays().map((display) => display.workArea),
  );

const snapshot = (window: TrackedWindow): WindowState => {
  const bounds = window.getNormalBounds();
  return { ...bounds, maximized: window.isMaximized() };
};

export const trackWindowState = (
  window: TrackedWindow,
  store: WindowStateStore,
  logger: Logger,
): void => {
  let timer: NodeJS.Timeout | null = null;
  const persist = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
      return;
    }
    store.save(snapshot(window)).catch((error: unknown) => {
      logger.warn('Failed to save the window position', { error });
    });
  };
  const schedule = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(persist, SAVE_DELAY_MS);
  };
  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    persist();
  });
};
