// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { renderApp, resetStores } from './support/render-app';

const key = (
  value: string,
  init: KeyboardEventInit = {},
  target: Element = document.activeElement ?? document.body,
) => {
  act(() => {
    fireEvent.keyDown(target, { key: value, ...init });
  });
};

const openThreadBySubject = async (subject: string) => {
  const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
  const row = within(list)
    .getAllByRole('option')
    .find((item) => item.textContent.includes(subject));
  expect(row).toBeDefined();
  act(() => {
    fireEvent.click(row ?? document.body);
  });
  return screen.findByRole('heading', { level: 1, name: subject });
};

describe('composing', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('sends a new message only after confirmation and shows it in Odoslané', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    key('c');
    const dialog = screen.getByRole('dialog', { name: 'Nová správa' });
    const to = within(dialog).getByRole('textbox', { name: 'Komu' });
    act(() => {
      fireEvent.focus(to);
      fireEvent.change(to, { target: { value: 'ondrej@example.sk' } });
    });
    expect(within(dialog).getByText('nový kontakt')).toBeDefined();
    key('Enter', {}, to);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Predmet' }), {
      target: { value: 'Výlet do Tatier' },
    });
    const body = within(dialog).getByRole('textbox', { name: 'Text správy' });
    fireEvent.change(body, { target: { value: 'Ahoj Ondro, ideme v sobotu?' } });
    key('Enter', { ctrlKey: true }, body);
    const confirm = screen.getByRole('alertdialog', {
      name: 'Odoslať ondrej@example.sk z účtu eFabrica?',
    });
    expect(within(confirm).getByText('Ahoj Ondro, ideme v sobotu?')).toBeDefined();
    key('Enter');
    expect(screen.queryByRole('dialog', { name: 'Nová správa' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Odoslané ondrej@example.sk');
    await new Promise((resolve) => setTimeout(resolve, 80));
    key('g');
    key('t');
    expect(await screen.findByText('Výlet do Tatier')).toBeDefined();
  });

  it('keeps the composer when sending is cancelled and restores it on undo', async () => {
    renderApp();
    await openThreadBySubject('Obed v piatok?');
    key('r');
    const area = await screen.findByRole('textbox', { name: 'Odpoveď' });
    expect((area as HTMLTextAreaElement).value).toBe('Ahoj Tomáš, idem, len prídem o 12:15.');
    fireEvent.change(area, { target: { value: 'Ahoj Tomáš, idem.' } });
    key('Enter', { ctrlKey: true }, area);
    expect(screen.getByRole('alertdialog', { name: /Odoslať Tomáš Baláž/ })).toBeDefined();
    key('Escape');
    expect(screen.getByRole('textbox', { name: 'Odpoveď' })).toBeDefined();
    key('Enter', { ctrlKey: true }, screen.getByRole('textbox', { name: 'Odpoveď' }));
    key('Enter');
    expect(screen.getByRole('status').textContent).toContain('Odoslané z meno@efabrica.sk');
    expect(screen.queryByRole('textbox', { name: 'Odpoveď' })).toBeNull();
    key('z');
    const restored = await screen.findByRole('textbox', { name: 'Odpoveď' });
    expect((restored as HTMLTextAreaElement).value).toBe('Ahoj Tomáš, idem.');
  });

  it('persists checklist ticks and prefills a reply from an AI suggestion', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    renderApp({ demo: () => client });
    await openThreadBySubject('Code review: refaktor platobnej brány');
    expect(screen.getByRole('region', { name: 'Zhrnutie' })).toBeDefined();
    const check = screen.getByRole('button', { name: /Pozrieť MR !412/ });
    fireEvent.click(check);
    await waitFor(() => {
      expect(check.getAttribute('aria-pressed')).toBe('true');
    });
    const page = await client.listThreads({ view: 'inbox', q: 'Code review' });
    const reviewId = page.items.find((item) => item.subject.startsWith('Code review'))?.id;
    expect(reviewId).toBeDefined();
    const detail = reviewId === undefined ? null : await client.getThread(reviewId);
    expect(detail?.checklist.find((item) => item.text.includes('MR !412'))?.done).toBe(true);
    key('1');
    const area = await screen.findByRole('textbox', { name: 'Odpoveď' });
    expect((area as HTMLTextAreaElement).value).toContain('pozriem to do obeda');
  });

  it('renders HTML mail in a sandboxed iframe with remote images blocked', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    key('g');
    key('o');
    await openThreadBySubject('Č. 212: CSS anchor positioning v praxi');
    const frame = screen.getByTitle<HTMLIFrameElement>(/Obsah správy/);
    expect(frame.getAttribute('sandbox')).toBe(
      'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    );
    expect(frame.getAttribute('srcdoc')).toContain('img-src data: cid:;');
    fireEvent.click(screen.getByRole('button', { name: 'Zobraziť obrázky' }));
    await waitFor(() => {
      expect(frame.getAttribute('srcdoc')).toContain('img-src data: cid: https: http:');
    });
  });
});
