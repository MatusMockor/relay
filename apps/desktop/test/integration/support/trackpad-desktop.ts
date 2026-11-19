import type { TrackpadScrollEvent } from '@relay/shared/ipc';
import { act, fireEvent, screen } from '@testing-library/react';
import { composeIpc } from '../../../src/main/composition/compose-ipc';
import { EventHub } from '../../../src/main/events/event-hub';
import {
  type InputEventSource,
  trackTrackpadScroll,
} from '../../../src/main/window/track-trackpad-scroll';
import { createRelayBridge } from '../../../src/preload/create-bridge';
import { createBrowserPlatform } from '../../../src/renderer/src/platform/BrowserPlatform';
import { createElectronPlatform } from '../../../src/renderer/src/platform/ElectronPlatform';
import type { Platform } from '../../../src/renderer/src/platform/Platform';
import { settle } from '../../../src/renderer/test/features-support';
import { renderApp, storageWith } from '../../../src/renderer/test/support/render-app';
import { InMemoryIpc } from '../../main/in-memory-ipc';

export const SUBJECT = 'Obed v piatok?';
const appMetadata = {
  name: 'Relay',
  version: '0.1.12',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

type InputListener = (event: unknown, input: { readonly type: string }) => void;

export class FakeContents implements InputEventSource {
  private listener: InputListener = () => undefined;

  on(_event: 'input-event', listener: InputListener): this {
    this.listener = listener;
    return this;
  }

  input(type: string): void {
    this.listener({}, { type });
  }
}

export type Delta = readonly [x: number, y: number];

let streams = 0;

export const browserPlatform = (): Platform =>
  createBrowserPlatform(storageWith({ mode: 'local' }));

export const desktopPlatform = (contents: FakeContents): Platform => {
  const scrolls = new EventHub<TrackpadScrollEvent>();
  trackTrackpadScroll(contents, (event) => {
    scrolls.publish(event);
  });
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, trackpadScroll: scrolls })),
    () => {
      streams += 1;
      return `swipe-${String(streams)}`;
    },
  );
  return {
    ...browserPlatform(),
    subscribeToTrackpadScroll: (listener) =>
      createElectronPlatform(bridge).subscribeToTrackpadScroll(listener),
  };
};

export const start = async (platform: Platform) => {
  renderApp({ platform });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  await settle();
};

export const startDesktop = async (): Promise<FakeContents> => {
  const contents = new FakeContents();
  await start(desktopPlatform(contents));
  return contents;
};

export const wheel = (
  deltas: readonly Delta[],
  target: Element = document.body,
  init: WheelEventInit = { deltaMode: 0 },
): void => {
  act(() => {
    deltas.forEach(([deltaX, deltaY]) => {
      fireEvent.wheel(target, { ...init, deltaX, deltaY });
    });
  });
};

export const phase = async (contents: FakeContents, type: string): Promise<void> => {
  act(() => {
    contents.input(type);
  });
  await settle();
};

export const swipe = async (
  contents: FakeContents,
  deltas: readonly Delta[],
  target: Element = document.body,
): Promise<void> => {
  await phase(contents, 'gestureScrollBegin');
  wheel(deltas, target);
  await phase(contents, 'gestureScrollEnd');
};

export const steps = (count: number, delta: Delta): Delta[] =>
  Array.from({ length: count }, () => delta);
