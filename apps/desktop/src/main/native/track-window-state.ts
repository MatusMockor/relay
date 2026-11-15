import { type BrowserWindow, screen } from 'electron';
import { fitWindowState, type WindowState } from './window-bounds';
import type { WindowStateStore } from './window-state-store';

const SAVE_DELAY_MS = 500;

export const restoreWindowState = async (store: WindowStateStore): Promise<WindowState> =>
  fitWindowState(
    await store.load(),
    screen.getAllDisplays().map((display) => display.workArea),
  );

const snapshot = (window: BrowserWindow): WindowState => {
  const bounds = window.getNormalBounds();
  return { ...bounds, maximized: window.isMaximized() };
};

export const trackWindowState = (window: BrowserWindow, store: WindowStateStore): void => {
  let timer: NodeJS.Timeout | null = null;
  const persist = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
      return;
    }
    void store.save(snapshot(window));
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
