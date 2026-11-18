// @vitest-environment jsdom
import './support/node-abort-globals';
import { afterEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { FullScreenState, type FullScreenWindow } from '../../src/main/window/full-screen-state';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createBrowserPlatform } from '../../src/renderer/src/platform/BrowserPlatform';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import { applyWindowChrome } from '../../src/renderer/src/platform/window-chrome';
import { InMemoryIpc } from '../main/in-memory-ipc';

const appMetadata = {
  name: 'Relay',
  version: '0.1.0',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

class FakeWindow implements FullScreenWindow {
  private readonly listeners = new Map<string, () => void>();

  constructor(private fullScreen = false) {}

  isFullScreen(): boolean {
    return this.fullScreen;
  }

  on(event: string, listener: () => void): this {
    this.listeners.set(event, listener);
    return this;
  }

  toggle(fullScreen: boolean): void {
    this.fullScreen = fullScreen;
    this.listeners.get(fullScreen ? 'enter-full-screen' : 'leave-full-screen')?.();
  }
}

let streams = 0;

const startDesktop = (window: FakeWindow) => {
  const fullScreen = new FullScreenState();
  fullScreen.track(window);
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, fullScreen })),
    () => {
      streams += 1;
      return `full-screen-${String(streams)}`;
    },
  );
  return createElectronPlatform(bridge);
};

const root = document.documentElement;

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('window full screen chrome', () => {
  afterEach(() => {
    root.className = '';
  });

  it('marks the root while the mac window is in native full screen', async () => {
    const window = new FakeWindow();
    const stop = applyWindowChrome(root, startDesktop(window), true);
    await settle();
    expect(root.classList.contains('mac-inset')).toBe(true);
    expect(root.classList.contains('fullscreen')).toBe(false);

    window.toggle(true);
    await settle();
    expect(root.classList.contains('fullscreen')).toBe(true);

    window.toggle(false);
    await settle();
    expect(root.classList.contains('fullscreen')).toBe(false);

    stop();
    window.toggle(true);
    await settle();
    expect(root.classList.contains('fullscreen')).toBe(false);
  });

  it('picks up a window that is already in full screen when the renderer subscribes', async () => {
    const stop = applyWindowChrome(root, startDesktop(new FakeWindow(true)), true);
    await settle();
    expect(root.classList.contains('fullscreen')).toBe(true);
    stop();
  });

  it('leaves the browser build without the mac title bar chrome', async () => {
    const stop = applyWindowChrome(root, createBrowserPlatform(null), true);
    await settle();
    expect(root.className).toBe('');
    stop();
  });
});
