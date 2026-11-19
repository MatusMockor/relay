// @vitest-environment jsdom
import './support/node-abort-globals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../src/renderer/src/state/ui-store';
import { openThreadBySubject } from '../../src/renderer/test/features-support';
import { resetStores } from '../../src/renderer/test/support/render-app';
import { phase, startDesktop, steps, SUBJECT, swipe, wheel } from './support/trackpad-desktop';

interface Strip {
  readonly element: HTMLElement;
  scrollTo(left: number): void;
}

const sideways = (initialLeft: number, direction: 'ltr' | 'rtl' = 'ltr'): Strip => {
  const element = document.createElement('div');
  element.style.overflowX = 'auto';
  element.style.direction = direction;
  let left = initialLeft;
  Object.defineProperties(element, {
    scrollWidth: { value: 800 },
    clientWidth: { value: 200 },
    scrollLeft: { get: () => left },
  });
  document.body.append(element);
  return {
    element,
    scrollTo: (next) => {
      left = next;
    },
  };
};

const threadStaysOpen = (): void => {
  expect(useUiStore.getState().openThreadId).not.toBeNull();
};

describe('trackpad swipes over content that scrolls sideways', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('scrolls content that can move sideways instead of going back', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, steps(4, [-40, 0]), sideways(120).element);
    threadStaysOpen();
  });

  it('goes back when sideways content is already scrolled to its edge', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, steps(4, [-40, 0]), sideways(0).element);
    expect(useUiStore.getState().openThreadId).toBeNull();
  });

  it('keeps scrolling content that reaches its edge during the same gesture', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    const strip = sideways(5);
    await phase(contents, 'gestureScrollBegin');
    wheel([[-5, 0]], strip.element);
    strip.scrollTo(0);
    wheel(steps(4, [-40, 0]), strip.element);
    await phase(contents, 'gestureScrollEnd');
    threadStaysOpen();
  });

  it('scrolls right to left content that can still move left', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, steps(4, [-40, 0]), sideways(-120, 'rtl').element);
    threadStaysOpen();
  });

  it('goes back when right to left content is at its left edge', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, steps(4, [-40, 0]), sideways(-600, 'rtl').element);
    expect(useUiStore.getState().openThreadId).toBeNull();
  });
});
