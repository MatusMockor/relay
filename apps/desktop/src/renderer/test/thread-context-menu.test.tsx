// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { threadMenuItems } from '../src/features/list/thread-menu-items';
import { present } from './support/present';
import { renderApp, resetStores } from './support/render-app';
import { serverThread } from './support/thread-fixtures';

const INBOX_ITEMS = [
  'Označiť ako prečítané',
  'Hotovo',
  'Pripomenúť…',
  'Presunúť do koša',
  'Vytvoriť pravidlo z mailu…',
];

const key = (value: string) => {
  act(() => {
    fireEvent.keyDown(document.body, { key: value });
  });
};

const rows = () =>
  within(screen.getByRole('listbox', { name: 'Konverzácie' })).getAllByRole('option');
const subjectOf = (row: HTMLElement) => row.querySelector('.subj')?.textContent.trim() ?? '';
const rowBySubject = (subject: string) => present(rows().find((row) => subjectOf(row) === subject));
const menuLabels = () =>
  within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((entry) => entry.textContent);

const rightClick = (row: HTMLElement): boolean => {
  let notPrevented = true;
  act(() => {
    notPrevented = fireEvent.contextMenu(row, { clientX: 120, clientY: 200 });
  });
  return notPrevented;
};

const choose = (label: string) => {
  act(() => {
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: label }));
  });
};

const unreadSubject = async (): Promise<string> => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  const unread = rows().filter((row) => row.classList.contains('unread'));
  return subjectOf(present(unread.find((row) => row.getAttribute('aria-selected') !== 'true')));
};

describe('thread row context menu', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('selects the right-clicked row and shows the inbox items', async () => {
    renderApp();
    const subject = await unreadSubject();

    const notPrevented = rightClick(rowBySubject(subject));

    expect(notPrevented).toBe(false);
    expect(rowBySubject(subject).getAttribute('aria-selected')).toBe('true');
    expect(menuLabels()).toEqual(INBOX_ITEMS);
    expect(screen.getByRole('menu').querySelectorAll('.sepl')).toHaveLength(2);
    expect(screen.queryByRole('heading', { level: 1, name: subject })).toBeNull();
  });

  it('toggles the read state of the row', async () => {
    renderApp();
    const subject = await unreadSubject();
    rightClick(rowBySubject(subject));

    choose('Označiť ako prečítané');

    await waitFor(() => {
      expect(rowBySubject(subject).querySelector('.dot')).toBeNull();
    });
    rightClick(rowBySubject(subject));
    expect(menuLabels()[0]).toBe('Označiť ako neprečítané');
    choose('Označiť ako neprečítané');
    await waitFor(() => {
      expect(rowBySubject(subject).querySelector('.dot')).not.toBeNull();
    });
  });

  it('marks the row done with a toast', async () => {
    renderApp();
    const subject = await unreadSubject();
    rightClick(rowBySubject(subject));

    choose('Hotovo');

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Hotovo');
    });
    await waitFor(() => {
      expect(rows().map(subjectOf)).not.toContain(subject);
    });
  });

  it('opens the reminder picker', async () => {
    renderApp();
    const subject = await unreadSubject();
    rightClick(rowBySubject(subject));

    choose('Pripomenúť…');

    expect(await screen.findByRole('textbox', { name: 'Vlastný čas' })).toBeDefined();
  });

  it('offers restore instead of trash in the trash', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    key('g');
    key('k');
    expect(await screen.findByRole('heading', { name: /Kôš/ })).toBeDefined();
    await waitFor(() => {
      expect(rows().length).toBeGreaterThan(0);
    });

    rightClick(present(rows()[0]));

    expect(menuLabels()).toContain('Obnoviť');
    expect(menuLabels()).not.toContain('Presunúť do koša');
  });

  it('leaves the system menu alone on draft rows', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    key('g');
    key('d');
    expect(await screen.findByRole('heading', { name: /Koncepty/ })).toBeDefined();
    await waitFor(() => {
      expect(rows().length).toBeGreaterThan(0);
    });

    const notPrevented = rightClick(present(rows()[0]));

    expect(notPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('thread menu items', () => {
  const labels = (view: string, unread = false) =>
    threadMenuItems(view, serverThread('Porada', { unread })).map((entry) =>
      entry.type === 'item' ? `${entry.id}:${entry.label}` : '---',
    );

  it('maps every view to its items', () => {
    expect(labels('inbox', true)).toEqual([
      'read:Označiť ako prečítané',
      'done:Hotovo',
      'remind:Pripomenúť…',
      '---',
      'trash:Presunúť do koša',
      '---',
      'rule:Vytvoriť pravidlo z mailu…',
    ]);
    expect(labels('done')).toEqual([
      'unread:Označiť ako neprečítané',
      'done:Vrátiť do Doručenej pošty',
      '---',
      'trash:Presunúť do koša',
      '---',
      'rule:Vytvoriť pravidlo z mailu…',
    ]);
    expect(labels('trash')).toEqual([
      'unread:Označiť ako neprečítané',
      'done:Obnoviť',
      '---',
      'rule:Vytvoriť pravidlo z mailu…',
    ]);
    expect(labels('spam')).toEqual([
      'unread:Označiť ako neprečítané',
      'spam:Nie je spam',
      '---',
      'trash:Presunúť do koša',
      '---',
      'rule:Vytvoriť pravidlo z mailu…',
    ]);
    expect(labels('sent')).toEqual([
      'unread:Označiť ako neprečítané',
      '---',
      'trash:Presunúť do koša',
      '---',
      'rule:Vytvoriť pravidlo z mailu…',
    ]);
    expect(labels('tasks')).toEqual(labels('reminders'));
  });

  it('offers no reminder in the done view', () => {
    expect(labels('done')).not.toContain('remind:Pripomenúť…');
  });

  it('enables every item', () => {
    const items = threadMenuItems('inbox', serverThread('Porada'));
    expect(items.every((entry) => entry.type === 'separator' || entry.enabled)).toBe(true);
  });
});
