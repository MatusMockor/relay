import { BrowserWindow, nativeTheme } from 'electron';
import type { NativeThemePort, ThemedWindows } from './native-theme-sync';

export const electronNativeTheme = (): NativeThemePort => ({
  setSource: (source) => {
    nativeTheme.themeSource = source;
  },
  prefersDark: () => nativeTheme.shouldUseDarkColors,
  onUpdated: (listener) => {
    nativeTheme.on('updated', listener);
    return () => {
      nativeTheme.off('updated', listener);
    };
  },
});

export const electronThemedWindows = (): ThemedWindows => ({
  setBackground: (color) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.setBackgroundColor(color);
    });
  },
});
