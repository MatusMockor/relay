// @vitest-environment jsdom
import './support/node-abort-globals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../src/renderer/src/state/ui-store';
import { openThreadBySubject, pause } from '../../src/renderer/test/features-support';
import { resetStores } from '../../src/renderer/test/support/render-app';
import {
  browserPlatform,
  phase,
  start,
  startDesktop,
  steps,
  SUBJECT,
  swipe,
  wheel,
} from './support/trackpad-desktop';

describe('trackpad gestures that do not navigate', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('ignores a vertical scroll that drifts sideways', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, steps(10, [-15, -40]));
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('ignores a swipe that turns into a vertical scroll', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, [...steps(2, [-20, 0]), ...steps(6, [-20, -60])]);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('ignores a pinch to zoom', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await phase(contents, 'gestureScrollBegin');
    wheel(steps(4, [-40, 0]), document.body, { deltaMode: 0, ctrlKey: true });
    await phase(contents, 'gestureScrollEnd');
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('ignores a mouse wheel that scrolls by lines', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await phase(contents, 'gestureScrollBegin');
    wheel(steps(4, [-40, 0]), document.body, { deltaMode: 1 });
    await phase(contents, 'gestureScrollEnd');
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('starts a fresh gesture after an earlier scroll was ignored', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    wheel(steps(3, [0, -40]));
    await pause(150);
    await swipe(contents, steps(4, [-40, 0]));
    expect(useUiStore.getState().openThreadId).toBeNull();
  });

  it('ignores other input events from the window', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await phase(contents, 'mouseMove');
    wheel([...steps(4, [-40, 0]), [0, 0]]);
    await phase(contents, 'mouseWheel');
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('ignores horizontal wheel swipes when the window never reports trackpad scrolling', async () => {
    await start(browserPlatform());
    await openThreadBySubject(SUBJECT);
    wheel([...steps(6, [-40, 0]), [0, 0]]);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });
});
