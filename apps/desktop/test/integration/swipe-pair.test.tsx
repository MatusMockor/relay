// @vitest-environment jsdom
import './support/node-abort-globals';
import type { TrackpadScrollEvent } from '@relay/shared/ipc';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { EventHub } from '../../src/main/events/event-hub';
import { MenuCommandRequests } from '../../src/main/native/menu-command-requests';
import { type SwipeWindow, trackSwipeCommands } from '../../src/main/window/track-swipe-commands';
import { trackTrackpadScroll } from '../../src/main/window/track-trackpad-scroll';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import type { Platform } from '../../src/renderer/src/platform/Platform';
import { setUi, useUiStore } from '../../src/renderer/src/state/ui-store';
import { openThreadBySubject, settle } from '../../src/renderer/test/features-support';
import { renderApp, resetStores } from '../../src/renderer/test/support/render-app';
import { InMemoryIpc } from '../main/in-memory-ipc';
import {
  browserPlatform,
  FakeContents,
  phase,
  steps,
  SUBJECT,
  wheel,
} from './support/trackpad-desktop';

const appMetadata = {
  name: 'Relay',
  version: '0.1.12',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

type SwipeListener = (event: unknown, direction: string) => void;

class FakeWindow implements SwipeWindow {
  private listener: SwipeListener = () => undefined;

  on(_event: 'swipe', listener: SwipeListener): this {
    this.listener = listener;
    return this;
  }

  swipe(direction: string): void {
    this.listener({}, direction);
  }
}

let streams = 0;

const startDesktop = async () => {
  const window = new FakeWindow();
  const contents = new FakeContents();
  const menuCommands = new MenuCommandRequests();
  const trackpadScroll = new EventHub<TrackpadScrollEvent>();
  trackSwipeCommands(window, (command) => {
    menuCommands.request(command);
  });
  trackTrackpadScroll(contents, (event) => {
    trackpadScroll.publish(event);
  });
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, menuCommands, trackpadScroll })),
    () => {
      streams += 1;
      return `pair-${String(streams)}`;
    },
  );
  const desktop = createElectronPlatform(bridge);
  const platform: Platform = {
    ...browserPlatform(),
    subscribeToMenuCommands: (listener) => desktop.subscribeToMenuCommands(listener),
    subscribeToTrackpadScroll: (listener) => desktop.subscribeToTrackpadScroll(listener),
  };
  renderApp({ platform });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  await settle();
  return { window, contents };
};

describe('swipe reported twice by macOS', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('steps back once when a two-finger swipe also arrives as a window swipe', async () => {
    const { window, contents } = await startDesktop();
    await openThreadBySubject(SUBJECT);
    act(() => {
      setUi({ searchOpen: true });
    });
    await phase(contents, 'gestureScrollBegin');
    wheel(steps(4, [-40, 0]));
    await phase(contents, 'gestureScrollEnd');
    act(() => {
      window.swipe('left');
    });
    await settle();
    expect(useUiStore.getState().searchOpen).toBe(false);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });
});
