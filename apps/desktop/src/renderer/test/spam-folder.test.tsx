// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SplitSchema } from '@relay/shared';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { threadItem } from '../src/features/mail/list-items';
import { rowActionLabels } from '../src/features/shell/RowActions';
import { splitGKey } from '../src/features/shell/SplitTabs';
import { setUi } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';
import { serverThread } from './support/thread-fixtures';

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

  it('forgets the undo of a spam report the server rejected', async () => {
    renderApp({
      demo: () => ({
        ...createDemoMailClient({ aiStepMs: 0 }),
        applyThreadAction: () => Promise.reject(new Error('Nahlásenie zlyhalo')),
      }),
    });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    key('!');
    await waitFor(() => {
      expect(toast().textContent).toContain('Nahlásenie zlyhalo');
    });
    key('z');

    expect(toast().textContent).toContain('Nie je čo vrátiť');
  });

  it('offers no spam report for a conversation in the trash', async () => {
    const paletteText = (query: string) => {
      key('k', { ctrlKey: true });
      fireEvent.change(screen.getByRole('textbox', { name: 'Hľadať príkaz' }), {
        target: { value: query },
      });
      const text = screen.getByRole('listbox', { name: 'Výsledky' }).textContent;
      key('Escape');
      return text;
    };
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    expect(paletteText('spam')).toContain('Nahlásiť spam');

    key('g');
    key('k');
    expect(await screen.findByRole('heading', { name: /Kôš/ })).toBeDefined();
    await waitFor(() => {
      expect(rows().length).toBeGreaterThan(0);
    });

    expect(paletteText('spam')).not.toContain('Nahlásiť spam');
  });

  it('keeps row actions in the Spam view tied to each row state', () => {
    const inbox = threadItem(serverThread('Porada'));
    const spam = threadItem(serverThread('Výhra', { state: 'spam' }));

    expect(rowActionLabels('spam', spam, true)).toEqual(['Nie je spam', 'Do koša']);
    expect(rowActionLabels('spam', inbox, true)).not.toContain('Nie je spam');
    expect(rowActionLabels('trash', inbox, true)).not.toContain('Obnoviť');
  });

  it('assigns no G shortcut to a split whose letters are all reserved', () => {
    const split = SplitSchema.parse({
      id: 'spl-tip',
      userId: 'usr-1',
      accountId: null,
      name: 'TIP',
      order: 0,
      exclusive: false,
      hideTasks: false,
      rules: [{ type: 'fromDomain', domain: 'tip.sk' }],
    });

    expect(splitGKey(split)).toBeNull();
  });
});
