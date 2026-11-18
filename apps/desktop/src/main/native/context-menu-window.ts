import { BrowserWindow } from 'electron';

export interface WindowSource<Window> {
  focused(): Window | null;
  all(): readonly Window[];
}

export const electronWindows: WindowSource<BrowserWindow> = {
  focused: () => BrowserWindow.getFocusedWindow(),
  all: () => BrowserWindow.getAllWindows(),
};

export const contextMenuWindow =
  <Window>(source: WindowSource<Window>) =>
  (): Window | null =>
    source.focused() ?? source.all()[0] ?? null;
