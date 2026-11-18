import type { Platform } from './Platform';

export const applyWindowChrome = (
  root: HTMLElement,
  platform: Platform,
  isMac: boolean,
): (() => void) => {
  root.classList.toggle('mac-inset', isMac && platform.kind === 'electron');
  return platform.subscribeToFullScreen((fullScreen) => {
    root.classList.toggle('fullscreen', fullScreen);
  });
};
