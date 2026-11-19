import type { PreviewKey, PreviewKeyEvent } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { EventHub } from '../../src/main/events/event-hub';
import {
  type FocusedFrame,
  type KeyInput,
  type PreviewKeySource,
  trackPreviewKeys,
} from '../../src/main/window/track-preview-keys';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import { InMemoryIpc } from '../main/in-memory-ipc';

const appMetadata = {
  name: 'Relay',
  version: '0.1.16',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

class FakeContents implements PreviewKeySource {
  focusedFrame: FocusedFrame | null = null;
  private listener: (event: { preventDefault(): void }, input: KeyInput) => void = () => undefined;

  on(
    _event: 'before-input-event',
    listener: (event: { preventDefault(): void }, input: KeyInput) => void,
  ): this {
    this.listener = listener;
    return this;
  }

  press(key: string, overrides: Partial<KeyInput> = {}): boolean {
    let prevented = false;
    const input = { type: 'keyDown', shift: false, control: false, alt: false, meta: false };
    this.listener(
      {
        preventDefault: () => {
          prevented = true;
        },
      },
      { ...input, key, ...overrides },
    );
    return prevented;
  }
}

const MAIN: FocusedFrame = { url: 'file:///opt/relay/renderer/index.html', parent: null };
const PDF_FRAME: FocusedFrame = { url: 'blob:file:///7931e073', parent: MAIN };
const PDF_INNER: FocusedFrame = {
  url: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html',
  parent: PDF_FRAME,
};
const MAIL_FRAME: FocusedFrame = { url: 'about:srcdoc', parent: MAIN };

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const startDesktop = () => {
  const contents = new FakeContents();
  const hub = new EventHub<PreviewKeyEvent>();
  trackPreviewKeys(contents, (key) => {
    hub.publish({ key });
  });
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, previewKeys: hub })),
    () => 'preview-keys',
  );
  const received: PreviewKey[] = [];
  const stop = createElectronPlatform(bridge).subscribeToPreviewKeys((key) => {
    received.push(key);
  });
  return { contents, received, stop };
};

describe('keys pressed inside an attachment preview frame', () => {
  it('reaches the renderer for Escape and the arrows and keeps them from the PDF viewer', async () => {
    const { contents, received, stop } = startDesktop();
    await settle();

    contents.focusedFrame = PDF_FRAME;
    expect(contents.press('Escape')).toBe(true);
    contents.focusedFrame = PDF_INNER;
    expect(contents.press('ArrowRight')).toBe(true);
    expect(contents.press('ArrowLeft')).toBe(true);
    await settle();

    expect(received).toEqual(['Escape', 'ArrowRight', 'ArrowLeft']);
    stop();
  });

  it('leaves keys of the app document, mail frames, other keys and shortcuts alone', async () => {
    const { contents, received, stop } = startDesktop();
    await settle();

    contents.focusedFrame = MAIN;
    expect(contents.press('Escape')).toBe(false);
    contents.focusedFrame = MAIL_FRAME;
    expect(contents.press('Escape')).toBe(false);
    contents.focusedFrame = PDF_FRAME;
    expect(contents.press('ArrowDown')).toBe(false);
    expect(contents.press('Escape', { type: 'keyUp' })).toBe(false);
    expect(contents.press('ArrowLeft', { meta: true })).toBe(false);
    contents.focusedFrame = null;
    expect(contents.press('Escape')).toBe(false);
    await settle();

    expect(received).toEqual([]);
    stop();
  });
});
