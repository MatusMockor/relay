// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoConnectionId } from '../src/data/demo/demo-task-system-data';
import { press } from './features-support';
import { resetStores } from './support/render-app';
import {
  ACME_JIRA,
  expectField,
  openConnection,
  renderWithLinks,
  resetWithSidebar,
  selectedTaskKey,
  settingsSheet,
  taskGroupLabels,
  taskKeys,
  taskRows,
  taskSystemClient,
} from './support/task-systems';
import { recording } from './support/tasks-view';

const ORDER = [
  'ACME-142',
  'ACME-139',
  'MOB-58',
  'ACME-131',
  'OPS-17',
  'MOB-44',
  'ACME-120',
  'ACME-97',
];

const issueUrl = (key: string) => `https://acme.atlassian.net/browse/${key}`;

describe('task system list', () => {
  beforeEach(resetWithSidebar);
  afterEach(resetStores);

  it('groups my open tickets by priority with key, status and project', async () => {
    renderWithLinks(taskSystemClient());
    await openConnection();

    await waitFor(() => {
      expect(taskKeys()).toEqual(ORDER);
    });
    expect(taskGroupLabels()).toEqual(['Urgentné', 'Vysoká', 'Stredná', 'Nízka', 'Bez priority']);
    const first = taskRows()[0] ?? document.body;
    expect(within(first).getByText('Platby kartou padajú pri 3D Secure overení')).toBeDefined();
    expect(within(first).getByText('In Progress')).toBeDefined();
    expect(within(first).getByText('Acme Web')).toBeDefined();
    expect(within(first).getByText('dnes')).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: new RegExp(ACME_JIRA) })).toBeDefined();
  });

  it('walks the tickets with j and k and opens the selected one with Enter', async () => {
    const opened = renderWithLinks(taskSystemClient());
    await openConnection();
    await waitFor(() => {
      expect(selectedTaskKey()).toBe('ACME-142');
    });

    press('j', {}, document.body);
    press('j', {}, document.body);
    expect(selectedTaskKey()).toBe('MOB-58');
    press('k', {}, document.body);
    expect(selectedTaskKey()).toBe('ACME-139');

    press('Enter', {}, document.body);

    expect(opened).toEqual([issueUrl('ACME-139')]);
  });

  it('opens a ticket in the browser on click and selects it', async () => {
    const opened = renderWithLinks(taskSystemClient());
    await openConnection();
    const row = await waitFor(() => {
      const found = taskRows().find((item) => item.textContent.includes('OPS-17'));
      expect(found).toBeDefined();
      return found ?? document.body;
    });

    act(() => {
      fireEvent.click(row);
    });

    expect(opened).toEqual([issueUrl('OPS-17')]);
    expect(selectedTaskKey()).toBe('OPS-17');
  });

  it('ignores mail actions while a task system is shown', async () => {
    const { client, actions } = recording(taskSystemClient());
    renderWithLinks(client);
    await openConnection();
    await waitFor(() => {
      expect(selectedTaskKey()).toBe('ACME-142');
    });

    ['e', '#', '!', 'Delete', 'h', 'v', 'l', 'r'].forEach((key) => {
      press(key, {}, document.body);
    });
    press('p', {}, document.body);
    press('1', { code: 'Digit1' }, document.body);

    expect(actions).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(taskKeys()).toEqual(ORDER);
  });

  it('shows an empty state when no ticket is open', async () => {
    renderWithLinks(taskSystemClient({ empty: true }));
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const item = await screen.findByRole('button', { name: new RegExp(ACME_JIRA) });
    act(() => {
      fireEvent.click(item);
    });

    expect(await screen.findByRole('heading', { name: 'Žiadne otvorené úlohy' })).toBeDefined();
  });

  it('notes when only the first tickets are shown', async () => {
    renderWithLinks(taskSystemClient({ truncated: true }));
    await openConnection();

    expect(await screen.findByText(/Zobrazujú sa len prvé úlohy/)).toBeDefined();
  });

  it('falls back to the inbox when the shown connection is disconnected', async () => {
    const client = taskSystemClient();
    renderWithLinks(client);
    await openConnection();

    await act(async () => {
      await client.disconnectTaskSystem(demoConnectionId(1));
    });

    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
    expect(screen.queryByRole('listbox', { name: 'Úlohy' })).toBeNull();
  });

  it('shows long GitHub keys with the repository and the issue number', async () => {
    const client = taskSystemClient({ connected: false });
    await client.connectTaskSystem({ provider: 'github', token: 'github_pat_1' });
    const opened = renderWithLinks(client);
    await openConnection('jnovak');

    await waitFor(() => {
      expect(taskKeys()).toEqual(['acme-sk/zakaznicky-portal-frontend#1287', 'acme-sk/api#342']);
    });
    const key = taskRows()[0]?.querySelector('.ts-key');
    expect(key?.getAttribute('title')).toBe('acme-sk/zakaznicky-portal-frontend#1287');
    expect(key?.querySelector('.ts-key-id')?.textContent).toBe('#1287');
    act(() => {
      fireEvent.click(taskRows()[0] ?? document.body);
    });
    expect(opened).toEqual(['https://github.com/acme-sk/zakaznicky-portal-frontend/issues/1287']);
  });

  it('offers to reconnect when the token was rejected', async () => {
    renderWithLinks(taskSystemClient({ tokenRejected: true }));
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const item = await screen.findByRole('button', { name: new RegExp(ACME_JIRA) });
    act(() => {
      fireEvent.click(item);
    });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Jira odmietla prihlasovacie údaje/)).toBeDefined();
    act(() => {
      fireEvent.click(within(alert).getByRole('button', { name: 'Znova pripojiť' }));
    });

    const form = within(settingsSheet()).getByRole('form', { name: 'Pripojiť task systém' });
    expectField(form, 'URL webu', 'https://acme.atlassian.net');
    expectField(form, 'Názov', ACME_JIRA);
  });
});
