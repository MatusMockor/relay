// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { MailClientError } from '../src/data/errors';
import { demoClient, press, settle } from './features-support';
import { gate } from './support/gate';
import { chord, CSV_SUBJECT, groupOfRow, selectRow } from './support/priority-view';
import { renderApp, resetStores } from './support/render-app';
import { gotoTasks, selectedSubject, TASK_TITLE, taskOf, toastText } from './support/tasks-view';

const openOnCsv = async (client: MailClient): Promise<void> => {
  renderApp({ demo: () => client });
  await gotoTasks();
  await waitFor(() => {
    expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');
  });
  selectRow(CSV_SUBJECT);
};

const undoButton = () =>
  within(screen.getByRole('status', { hidden: false })).queryByRole('button', { name: /Späť/ });

describe('priority writes in my tasks', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('keeps the latest choice when an earlier write fails after it', async () => {
    const base = demoClient();
    const slow = gate();
    const client: MailClient = {
      ...base,
      updateTask: async (taskId, patch) => {
        if (patch.priority !== 'high') {
          return base.updateTask(taskId, patch);
        }
        await slow.wait();
        return Promise.reject(
          new MailClientError({ code: 'internal', message: 'Uloženie zlyhalo' }),
        );
      },
    };
    await openOnCsv(client);

    chord('Digit2', 'ľ');
    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Vysoká');
    });
    chord('Digit1', '+');
    await waitFor(async () => {
      expect((await taskOf(base, TASK_TITLE)).priority).toBe('urgent');
    });
    act(() => {
      slow.open();
    });
    await settle(30);

    expect(groupOfRow(CSV_SUBJECT)).toBe('Urgentné');
    expect(toastText()).not.toContain('Uloženie zlyhalo');
  });

  it('rolls back and offers no undo when the write fails', async () => {
    const base = demoClient();
    const writes: string[] = [];
    const client: MailClient = {
      ...base,
      updateTask: (_taskId, patch) => {
        writes.push(patch.priority ?? '');
        return Promise.reject(
          new MailClientError({ code: 'internal', message: 'Uloženie zlyhalo' }),
        );
      },
    };
    await openOnCsv(client);

    chord('Digit1', '+');

    await waitFor(() => {
      expect(toastText()).toContain('Uloženie zlyhalo');
    });
    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');
    });
    expect(undoButton()).toBeNull();
    press('z', {}, document.body);
    await settle(30);
    expect(writes).toEqual(['urgent']);
  });

  it('rolls back with a Slovak message when an older server ignores the priority', async () => {
    const base = demoClient();
    const client: MailClient = {
      ...base,
      updateTask: (taskId, { priority: _ignored, ...rest }) => base.updateTask(taskId, rest),
    };
    await openOnCsv(client);

    chord('Digit1', '+');

    await waitFor(() => {
      expect(toastText()).toContain('nepodporuje priority úloh');
    });
    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');
    });
    expect((await taskOf(base, TASK_TITLE)).priority).toBe('low');
  });

  it('lets other keys through after P and drops the chord on navigation and overlays', async () => {
    const client = demoClient();
    await openOnCsv(client);
    const start = selectedSubject();

    press('p', {}, document.body);
    press('j', {}, document.body);
    await waitFor(() => {
      expect(selectedSubject()).not.toBe(start);
    });
    press('k', {}, document.body);
    press('p', {}, document.body);
    act(() => {
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    });
    await screen.findByRole('dialog', { name: 'Príkazy' });
    press('Escape');
    press('1', { code: 'Digit1' }, document.body);
    press('p', {}, document.body);
    selectRow('CMS-217');
    press('0', { code: 'Digit0' }, document.body);
    await settle(30);

    expect(selectedSubject()).toContain('CMS-217');
    expect((await taskOf(client, TASK_TITLE)).priority).toBe('low');
    expect((await taskOf(client, 'Editor stráca obrázky po uložení')).priority).toBe('urgent');
  });
});
