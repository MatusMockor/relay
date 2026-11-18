// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoIds } from '../src/data/demo/seed/ids';
import { projectThreadAction } from '../src/data/thread-projection';
import { setUi } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';
import { serverThread } from './support/thread-fixtures';

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
const picker = () => screen.findByRole('dialog', { name: 'Presunúť do' });
const targets = async () =>
  (
    await within(within(await picker()).getByRole('listbox', { name: 'Priečinky' })).findAllByRole(
      'option',
    )
  ).map((option) => option.textContent.trim());
const type = async (text: string) => {
  const input = within(await picker()).getByRole('textbox', { name: 'Hľadať priečinok' });
  act(() => {
    fireEvent.change(input, { target: { value: text } });
  });
};

const openScope = async (account: string) => {
  setUi({ scope: demoIds.account(account) });
  renderApp();
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  await waitFor(() => {
    expect(rows().length).toBeGreaterThan(0);
  });
};

describe('moving a thread to a folder', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('lists the inbox, archive and synced folders of a plain IMAP account on V', async () => {
    await openScope('efa');

    key('v');

    expect(await targets()).toEqual([
      'Doručená pošta',
      'Archív',
      'Faktúry',
      'Klienti / Zrnko',
      'Projekty',
      'Projekty / Alfa',
      'Projekty / Beta',
    ]);
  });

  it('filters as you type, moves on Enter and undoes the move', async () => {
    await openScope('efa');
    const subject = selectedSubject();
    key('v');
    await type('fakt');
    expect(await targets()).toEqual(['Faktúry']);

    key('Enter');

    expect(screen.getByRole('status').textContent).toContain('Presunuté do „Faktúry“');
    await waitFor(() => {
      expect(subjects()).not.toContain(subject);
    });
    key('z');
    await waitFor(() => {
      expect(subjects()).toContain(subject);
    });
  });

  it('lists Gmail labels and adds the label when moving a Gmail thread', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    setUi({ scope: demoIds.account('os') });
    renderApp({ demo: () => client });
    await waitFor(() => {
      expect(rows().length).toBeGreaterThan(0);
    });
    const subject = selectedSubject();
    key('v');
    expect(await targets()).toContain('Klienti / Acme');
    expect(await targets()).not.toContain('[Gmail] / Starred');
    await type('acme');

    key('Enter');

    await waitFor(() => {
      expect(subjects()).not.toContain(subject);
    });
    const labelled = await client.listThreads({ view: 'label', labelId: demoIds.label('acme') });
    expect(labelled.items.map((thread) => thread.subject)).toContain(subject);
  });

  it('opens the picker from the command palette', async () => {
    await openScope('efa');
    key('k', { ctrlKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Príkazy' });
    act(() => {
      fireEvent.change(within(palette).getByRole('textbox', { name: 'Hľadať príkaz' }), {
        target: { value: 'Presunúť' },
      });
    });

    key('Enter');

    expect(await picker()).toBeDefined();
  });

  it('projects a move to done, or to the inbox when the target is the inbox', () => {
    const thread = serverThread('Faktúra');
    const action = { type: 'move', mailboxId: demoIds.mailbox('efa') } as const;

    expect(projectThreadAction(thread, action).state).toBe('done');
    expect(projectThreadAction(thread, action, { targetRole: 'inbox' }).state).toBe('inbox');
    expect(
      projectThreadAction(thread, action, { labelId: demoIds.label('acme') }).labelIds,
    ).toContain(demoIds.label('acme'));
    expect(projectThreadAction(thread, { type: 'undoMove' })).toBe(thread);
  });
});
