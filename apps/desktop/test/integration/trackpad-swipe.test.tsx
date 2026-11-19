// @vitest-environment jsdom
import './support/node-abort-globals';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../../src/renderer/src/data/demo/seed/ids';
import { openThread } from '../../src/renderer/src/features/mail/navigation';
import { setUi, useUiStore } from '../../src/renderer/src/state/ui-store';
import { openThreadBySubject, settle } from '../../src/renderer/test/features-support';
import { resetStores } from '../../src/renderer/test/support/render-app';
import { phase, startDesktop, steps, SUBJECT, swipe, wheel } from './support/trackpad-desktop';

const HTML_SUBJECT = 'Č. 212: CSS anchor positioning v praxi';

const openSearchInThread = async (): Promise<void> => {
  await openThreadBySubject(SUBJECT);
  act(() => {
    setUi({ searchOpen: true });
  });
};

describe('trackpad swipe navigation', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('goes back when two fingers swipe to the right', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, steps(4, [-40, 2]));
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
  });

  it('goes forward when two fingers swipe to the left', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    const threadId = useUiStore.getState().openThreadId;
    await swipe(contents, steps(4, [-40, 0]));
    expect(useUiStore.getState().openThreadId).toBeNull();
    await swipe(contents, steps(4, [40, 0]));
    expect(useUiStore.getState().openThreadId).toBe(threadId);
  });

  it('stays put when the swipe is shorter than the threshold', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, steps(5, [-20, 0]));
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('counts only the distance that is left after swiping back', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    await swipe(contents, [...steps(4, [-40, 0]), ...steps(2, [40, 0])]);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('steps back only once for a long swipe', async () => {
    const contents = await startDesktop();
    await openSearchInThread();
    await swipe(contents, steps(12, [-40, 0]));
    expect(useUiStore.getState().searchOpen).toBe(false);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('goes back as soon as the fingers lift and not again when the gesture ends', async () => {
    const contents = await startDesktop();
    await openSearchInThread();
    await phase(contents, 'gestureScrollBegin');
    wheel([...steps(4, [-40, 0]), [0, 0]]);
    expect(useUiStore.getState().searchOpen).toBe(false);
    wheel(steps(4, [-40, 0]));
    await phase(contents, 'gestureScrollEnd');
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('steps once per gesture across two gestures', async () => {
    const contents = await startDesktop();
    await openSearchInThread();
    await swipe(contents, steps(4, [-40, 0]));
    expect(useUiStore.getState().searchOpen).toBe(false);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    await swipe(contents, steps(4, [-40, 0]));
    expect(useUiStore.getState().openThreadId).toBeNull();
  });

  it('leaves the thread alone while a message is being written', async () => {
    const contents = await startDesktop();
    await openThreadBySubject(SUBJECT);
    act(() => {
      setUi({ overlay: { kind: 'compose', init: {}, scope: 'all' } });
    });
    await swipe(contents, steps(4, [-40, 0]));
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(useUiStore.getState().overlay?.kind).toBe('compose');
  });

  it('goes forward when swiping over an HTML mail body', async () => {
    const contents = await startDesktop();
    act(() => {
      openThread(demoIds.thread('o-newsletter'));
    });
    await screen.findByTitle(`Obsah správy: ${HTML_SUBJECT}`);
    act(() => {
      openThread(demoIds.thread('c-lunch'));
    });
    await screen.findByRole('heading', { level: 1, name: SUBJECT });
    await swipe(contents, steps(4, [-40, 0]));
    const frame = await screen.findByTitle(`Obsah správy: ${HTML_SUBJECT}`);
    expect(frame).toBeInstanceOf(HTMLIFrameElement);
    const body = (frame as HTMLIFrameElement).contentDocument?.body;
    expect(body).toBeDefined();
    await settle();
    await swipe(contents, steps(4, [40, 0]), body ?? document.body);
    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('c-lunch'));
  });
});
