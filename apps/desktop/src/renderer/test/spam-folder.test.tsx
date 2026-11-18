// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUi } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';

const LOTTERY = 'Gratulujeme, vyhrali ste nový telefón';
const CRYPTO = 'Zarobte 5 000 € týždenne bez rizika';

const key = (value: string, init: KeyboardEventInit = {}) => {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: value, ...init });
  });
};

const rows = () =>
  within(screen.getByRole('listbox', { name: 'Konverzácie' })).getAllByRole('option');
const subjectOf = (row: HTMLElement) => row.querySelector('.subj')?.textContent.trim() ?? '';
const subjects = () => rows().map(subjectOf);
const selectedSubject = () =>
  subjectOf(rows().find((row) => row.getAttribute('aria-selected') === 'true') ?? document.body);
const toast = () => screen.getByRole('status', { hidden: false });

const openSpam = async () => {
  key('g');
  key('p');
  expect(await screen.findByRole('heading', { name: /Spam/ })).toBeDefined();
  await waitFor(() => {
    expect(subjects()).toContain(LOTTERY);
  });
};

describe('spam folder', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('lists Spam right before Kôš in the sidebar with its unread count', async () => {
    setUi({ leftUser: true });
    renderApp();
    const spam = await screen.findByTitle('Spam (G P)');
    await waitFor(() => {
      expect(spam.querySelector('.n')?.textContent).toBe('1');
    });
    const folders = [...document.querySelectorAll<HTMLButtonElement>('button.f')].map(
      (button) => button.querySelector('.fl')?.textContent,
    );
    expect(folders.indexOf('Spam') + 1).toBe(folders.indexOf('Kôš'));

    act(() => {
      fireEvent.click(spam);
    });
    expect(await screen.findByRole('heading', { name: /Spam/ })).toBeDefined();
    await waitFor(() => {
      expect(subjects().sort()).toEqual([CRYPTO, LOTTERY].sort());
    });
  });

  it('keeps spam out of the inbox and reports the selected conversation with !', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    expect(subjects()).not.toContain(LOTTERY);
    const subject = selectedSubject();

    key('!');

    expect(toast().textContent).toContain('Nahlásené ako spam');
    await waitFor(() => {
      expect(subjects()).not.toContain(subject);
    });
    key('z');
    await waitFor(() => {
      expect(subjects()).toContain(subject);
    });
    const restored = rows().find((item) => subjectOf(item) === subject);
    act(() => {
      if (restored !== undefined) {
        fireEvent.click(restored);
      }
    });
    await screen.findByRole('button', { name: 'Nahlásiť spam' });
    key('Escape');
    expect(selectedSubject()).toBe(subject);
    key('!');
    await waitFor(() => {
      expect(subjects()).not.toContain(subject);
    });
    await openSpam();
    expect(subjects()).toContain(subject);
  });

  it('brings a spam conversation back to the inbox with E and offers Nie je spam', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    await openSpam();
    const row = rows().find((item) => subjectOf(item) === LOTTERY);
    expect(row).toBeDefined();
    act(() => {
      if (row !== undefined) {
        fireEvent.click(row);
      }
    });
    expect(await screen.findByRole('button', { name: 'Nie je spam' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Nahlásiť spam' })).toBeNull();

    key('e');

    expect(toast().textContent).toContain('Nie je spam');
    key('g');
    key('i');
    await waitFor(() => {
      expect(subjects()).toContain(LOTTERY);
    });
  });
});
