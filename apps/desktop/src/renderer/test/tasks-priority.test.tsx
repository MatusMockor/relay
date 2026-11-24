// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoClient, press } from './features-support';
import {
  chord,
  CSV_SUBJECT,
  groupLabels,
  groupOfRow,
  rowSubjects,
  selectRow,
} from './support/priority-view';
import { renderApp, resetStores } from './support/render-app';
import { gotoTasks, selectedSubject, TASK_TITLE, taskOf, toastText } from './support/tasks-view';

describe('my tasks grouped by priority', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('groups the rows by priority and walks them in the displayed order', async () => {
    renderApp({ demo: demoClient });
    await gotoTasks();
    await waitFor(() => {
      expect(groupLabels()).toEqual(['Urgentné', 'Vysoká', 'Stredná', 'Nízka', 'Bez priority']);
    });
    expect(screen.getByRole('tab', { name: /Moje úlohy/ })).toBeDefined();
    const subjects = rowSubjects();
    expect(subjects[0]).toContain('CMS-217');
    expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');

    const walked = [selectedSubject()];
    subjects.slice(1).forEach(() => {
      press('j', {}, document.body);
      walked.push(selectedSubject());
    });

    expect(walked).toEqual(subjects);
  });

  it('changes the priority of the selected task with P and a digit and undoes it', async () => {
    const client = demoClient();
    renderApp({ demo: () => client });
    await gotoTasks();
    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');
    });
    selectRow(CSV_SUBJECT);

    chord('Digit1', '+');

    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Urgentné');
    });
    await waitFor(() => {
      expect(toastText()).toContain('Priorita: Urgentná');
    });
    expect(selectedSubject()).toContain(CSV_SUBJECT);
    await waitFor(async () => {
      expect((await taskOf(client, TASK_TITLE)).priority).toBe('urgent');
    });
    press('z', {}, document.body);
    await waitFor(async () => {
      expect((await taskOf(client, TASK_TITLE)).priority).toBe('low');
    });
    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');
    });
  });

  it('sets the priority from the command palette', async () => {
    const client = demoClient();
    renderApp({ demo: () => client });
    await gotoTasks();
    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');
    });
    selectRow(CSV_SUBJECT);
    act(() => {
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    });
    const palette = await screen.findByRole('dialog', { name: 'Príkazy' });
    act(() => {
      fireEvent.change(within(palette).getByRole('textbox', { name: 'Hľadať príkaz' }), {
        target: { value: 'Priorita: Bez priority' },
      });
    });
    press('Enter');

    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Bez priority');
    });
    await waitFor(async () => {
      expect((await taskOf(client, TASK_TITLE)).priority).toBe('none');
    });
  });

  it('ignores the P chord outside my tasks', async () => {
    const client = demoClient();
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    chord('Digit1', '1');

    expect((await taskOf(client, TASK_TITLE)).priority).toBe('low');
  });
});
