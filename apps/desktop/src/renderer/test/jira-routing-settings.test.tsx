// @vitest-environment jsdom
import {
  type SplitReplaceItem,
  splitInputsOf,
  supportedSplits,
  type UserSettingsPatch,
} from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { type SettingsSection, setUi } from '../src/state/ui-store';
import { demoClient, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const HIDE_IN_JIRA = 'Skryť vlákna, ktoré sú v Úlohách, v splite Jira';

const openSection = async (client: MailClient, section: SettingsSection) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section, adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const checkedOf = (sheet: HTMLElement, name: string) =>
  within(sheet).getByRole('switch', { name }).getAttribute('aria-checked');

const jiraSplitThreads = async (client: MailClient) => {
  const split = (await client.listSplits()).find((item) => item.name === 'Jira');
  expect(split).toBeDefined();
  const page = await client.listThreads({ view: 'inbox', splitId: split?.id });
  return { split, ids: page.items.map((thread) => thread.id) };
};

describe('Jira settings section', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('shows which Jira events go to tasks and saves a changed toggle', async () => {
    const base = demoClient();
    const patches: UserSettingsPatch[] = [];
    const client: MailClient = {
      ...base,
      updateSettings: (patch) => {
        patches.push(patch);
        return base.updateSettings(patch);
      },
    };
    const sheet = await openSection(client, 'jira');

    expect(within(sheet).getByRole('heading', { name: 'Čo pridať do Úloh' })).toBeDefined();
    await waitFor(() => {
      expect(checkedOf(sheet, 'Zmienka')).toBe('true');
    });
    expect(checkedOf(sheet, 'Priradenie')).toBe('true');
    expect(checkedOf(sheet, 'Komentár')).toBe('false');
    expect(checkedOf(sheet, 'Zmena stavu')).toBe('false');
    expect(checkedOf(sheet, 'Ostatné zmeny')).toBe('false');
    expect(within(sheet).getByText(/platí len pre nové notifikácie/)).toBeDefined();

    act(() => {
      fireEvent.click(within(sheet).getByRole('switch', { name: 'Ostatné zmeny' }));
    });

    await waitFor(() => {
      expect(checkedOf(sheet, 'Ostatné zmeny')).toBe('true');
    });
    expect(patches).toEqual([{ jira: { taskEvents: ['mention', 'assigned', 'other'] } }]);
    expect((await client.getSettings()).jira.taskEvents).toEqual(['mention', 'assigned', 'other']);
  });
});

describe('split hide tasks toggle', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('saves the flag for the toggled split only', async () => {
    const base = demoClient();
    const saves: SplitReplaceItem[][] = [];
    const client: MailClient = {
      ...base,
      replaceSplits: (splits) => {
        saves.push(splits);
        return base.replaceSplits(splits);
      },
    };
    const sheet = await openSection(client, 'splits');
    const open = await within(sheet).findByRole('button', { name: 'Otvoriť split Jira' });
    act(() => {
      fireEvent.click(open);
    });
    const toggle = await within(sheet).findByRole('switch', { name: HIDE_IN_JIRA });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    act(() => {
      fireEvent.click(toggle);
    });

    await waitFor(() => {
      expect(checkedOf(sheet, HIDE_IN_JIRA)).toBe('true');
    });
    expect(saves).toHaveLength(1);
    const flags = splitInputsOf(saves[0] ?? []).map((split) => [split.name, split.hideTasks]);
    expect(flags).toEqual([
      ['Jira', true],
      ['Klienti', false],
      ['Ostatné', false],
    ]);
    await settle();
  });

  it('hides threads with an open task from the demo split once the flag is on', async () => {
    const client = demoClient();
    const before = await jiraSplitThreads(client);
    const open = (await client.listTasks({})).items.filter(
      (task) =>
        task.state !== 'done' && task.threadId !== null && before.ids.includes(task.threadId),
    );
    expect(open.length).toBeGreaterThan(0);

    const splits = supportedSplits(await client.listSplits());
    await client.replaceSplits(
      splits.map((split) => ({ ...split, hideTasks: split.id === before.split?.id })),
    );

    const after = await jiraSplitThreads(client);
    expect(after.ids).toEqual(
      before.ids.filter((id) => !open.some((task) => task.threadId === id)),
    );
  });
});
