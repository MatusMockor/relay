// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { openThread } from '../src/features/mail/navigation';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, openThreadBySubject, press, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const SUBJECT = 'Obed v piatok?';
const HTML_SUBJECT = 'Č. 212: CSS anchor positioning v praxi';

const start = async (client: MailClient = demoClient()) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  return client;
};

const releaseButton = (button: number, target: Window = window): boolean => {
  let result = true;
  act(() => {
    result = fireEvent.mouseUp(target, { button });
  });
  return result;
};

const typeReply = async (text: string): Promise<HTMLTextAreaElement> => {
  press('r', {}, document.body);
  const area = await screen.findByRole('textbox', { name: 'Odpoveď' });
  fireEvent.change(area, { target: { value: text } });
  expect(area).toBeInstanceOf(HTMLTextAreaElement);
  return area as HTMLTextAreaElement;
};

describe('mouse back and forward buttons', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('closes the open thread and shows the list', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    expect(releaseButton(3)).toBe(false);
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
    expect(screen.queryByRole('heading', { level: 1, name: SUBJECT })).toBeNull();
  });

  it.each([0, 1, 2])('keeps the thread open for mouse button %i', async (button) => {
    await start();
    await openThreadBySubject(SUBJECT);
    expect(releaseButton(button)).toBe(true);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: SUBJECT })).toBeDefined();
  });

  it('closes the search when no thread is open', async () => {
    await start();
    press('/', {}, document.body);
    expect(useUiStore.getState().searchOpen).toBe(true);
    releaseButton(3);
    expect(useUiStore.getState().searchOpen).toBe(false);
    releaseButton(4);
    expect(useUiStore.getState().searchOpen).toBe(true);
  });

  it('walks back through the history one step per press', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    act(() => {
      setUi({ searchOpen: true, query: 'obed' });
    });
    releaseButton(3);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(useUiStore.getState().searchOpen).toBe(false);
    releaseButton(3);
    expect(useUiStore.getState().openThreadId).toBeNull();
  });

  it('goes forward again with button 4 after going back', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    const threadId = useUiStore.getState().openThreadId;
    releaseButton(3);
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(releaseButton(4)).toBe(false);
    expect(useUiStore.getState().openThreadId).toBe(threadId);
    expect(await screen.findByRole('heading', { level: 1, name: SUBJECT })).toBeDefined();
  });

  it('does nothing with button 4 when there is nothing to go forward to', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    expect(releaseButton(4)).toBe(false);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it.each([3, 4])('prevents the default press of mouse button %i', async (button) => {
    await start();
    let pressed = true;
    let clicked = true;
    act(() => {
      pressed = fireEvent.mouseDown(window, { button });
      clicked = fireEvent(window, new MouseEvent('auxclick', { button, cancelable: true }));
    });
    expect(pressed).toBe(false);
    expect(clicked).toBe(false);
  });

  it('goes forward when pressed over an HTML mail body', async () => {
    await start();
    act(() => {
      openThread(demoIds.thread('o-newsletter'));
    });
    await screen.findByTitle(`Obsah správy: ${HTML_SUBJECT}`);
    act(() => {
      openThread(demoIds.thread('c-lunch'));
    });
    await screen.findByRole('heading', { level: 1, name: SUBJECT });
    releaseButton(3);
    const frame = await screen.findByTitle(`Obsah správy: ${HTML_SUBJECT}`);
    expect(frame).toBeInstanceOf(HTMLIFrameElement);
    const view = (frame as HTMLIFrameElement).contentWindow;
    expect(view).not.toBeNull();
    await waitFor(() => {
      expect(releaseButton(4, view ?? window)).toBe(false);
    });
    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('c-lunch'));
  });

  it('saves the reply being written as a draft and shows the list', async () => {
    const client = await start();
    await openThreadBySubject(SUBJECT);
    await typeReply('Piatok mi vyhovuje.');
    releaseButton(3);
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(useUiStore.getState().reply).toBeNull();
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
    await waitFor(async () => {
      const drafts = await client.listDrafts();
      expect(drafts.some((draft) => draft.body.includes('Piatok mi vyhovuje.'))).toBe(true);
    });
    await openThreadBySubject(SUBJECT);
    press('r', {}, document.body);
    const reopened = await screen.findByRole('textbox', { name: 'Odpoveď' });
    expect((reopened as HTMLTextAreaElement).value).toBe('Piatok mi vyhovuje.');
  });

  it('reopens the thread with the reply when saving it fails after going back', async () => {
    const base = demoClient();
    await start({
      ...base,
      updateDraft: () => Promise.reject(new Error('server neodpovedá')),
      createDraft: () => Promise.reject(new Error('server neodpovedá')),
    });
    await openThreadBySubject(SUBJECT);
    await typeReply('Nestratí sa.');
    releaseButton(3);
    const restored = await screen.findByRole('textbox', { name: 'Odpoveď' });
    expect((restored as HTMLTextAreaElement).value).toBe('Nestratí sa.');
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('keeps Escape in the reply saving the draft without leaving the thread', async () => {
    const client = await start();
    await openThreadBySubject(SUBJECT);
    const area = await typeReply('Uložím na neskôr.');
    press('Escape', {}, area);
    await settle();
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(useUiStore.getState().reply).toBeNull();
    const drafts = await client.listDrafts();
    expect(drafts.filter((draft) => draft.body.includes('Uložím na neskôr.'))).toHaveLength(1);
  });

  it('saves the reply as a draft when Escape is pressed outside the reply box', async () => {
    const client = await start();
    await openThreadBySubject(SUBJECT);
    await typeReply('Ozvem sa zajtra.');
    press('Escape', {}, document.body);
    expect(useUiStore.getState().openThreadId).toBeNull();
    await waitFor(async () => {
      const drafts = await client.listDrafts();
      expect(drafts.some((draft) => draft.body.includes('Ozvem sa zajtra.'))).toBe(true);
    });
  });

  it('leaves the thread alone while the command palette is open', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    press('k', { ctrlKey: true }, document.body);
    expect(screen.getByRole('dialog', { name: 'Príkazy' })).toBeDefined();
    releaseButton(3);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Príkazy' })).toBeDefined();
  });

  it('leaves the thread alone while a message is being written', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    act(() => {
      setUi({ overlay: { kind: 'compose', init: {}, scope: 'all' } });
    });
    releaseButton(3);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(useUiStore.getState().overlay?.kind).toBe('compose');
  });

  it('keeps Escape closing the open thread', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    press('Escape', {}, document.body);
    expect(useUiStore.getState().openThreadId).toBeNull();
  });
});
