// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, settle } from './features-support';
import {
  backToList,
  change,
  checkbox,
  click,
  openAutomations,
  openRule,
  popover,
  stored,
} from './support/automations';
import { renderApp, resetStores } from './support/render-app';

const release = (button: number): void => {
  act(() => {
    fireEvent.mouseUp(window, { button });
  });
};

const settingsSheet = (): HTMLElement => screen.getByRole('dialog', { name: 'Nastavenia' });

const selectedTab = (): string | null =>
  within(settingsSheet())
    .getAllByRole('tab')
    .find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent ?? null;

const openSettings = async (): Promise<HTMLElement> => {
  renderApp({ demo: () => demoClient() });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
  });
  return settingsSheet();
};

const detail = (sheet: HTMLElement, name: string): HTMLElement | null =>
  within(sheet).queryByRole('region', { name: `Pravidlo ${name}` });

describe('history inside the settings', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('switches between visited sections with back and forward', async () => {
    const sheet = await openSettings();
    click(within(sheet).getByRole('tab', { name: 'Vzhľad' }));
    expect(selectedTab()).toContain('Vzhľad');

    release(3);
    expect(selectedTab()).toContain('Účty');
    release(4);
    expect(selectedTab()).toContain('Vzhľad');
  });

  it('keeps the focus inside the settings after going back from a focused tab', async () => {
    const sheet = await openSettings();
    const look = within(sheet).getByRole('tab', { name: 'Vzhľad' });
    click(look);
    act(() => {
      look.focus();
    });

    release(3);

    expect(selectedTab()).toContain('Účty');
    expect(document.activeElement).toBe(look);
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it('keeps the focus inside the settings after going back from a focused field', async () => {
    const sheet = await openAutomations(demoClient());
    const tibor = openRule(sheet, 'Tibor');
    click(within(tibor).getByRole('button', { name: 'Premenovať pravidlo Tibor' }));
    expect(document.activeElement).toBe(within(tibor).getByLabelText('Názov pravidla'));

    release(3);

    expect(detail(sheet, 'Tibor')).toBeNull();
    expect(document.activeElement).toBe(within(sheet).getByRole('tab', { name: 'Automatizácie' }));
  });

  it('reopens the closed settings when going back', async () => {
    const sheet = await openSettings();
    click(within(sheet).getByRole('tab', { name: 'Vzhľad' }));
    click(within(sheet).getByRole('button', { name: 'Zavrieť nastavenia' }));
    expect(screen.queryByRole('dialog', { name: 'Nastavenia' })).toBeNull();

    release(3);
    expect(selectedTab()).toContain('Vzhľad');
    release(3);
    expect(selectedTab()).toContain('Účty');
    release(3);
    expect(screen.queryByRole('dialog', { name: 'Nastavenia' })).toBeNull();
  });

  it('walks from a rule detail back to the list and forward again', async () => {
    const sheet = await openAutomations(demoClient());
    openRule(sheet, 'Tibor');

    release(3);
    expect(detail(sheet, 'Tibor')).toBeNull();
    expect(within(sheet).getByRole('listitem', { name: 'Pravidlo Tibor' })).toBeDefined();
    release(4);
    expect(detail(sheet, 'Tibor')).not.toBeNull();
  });

  it('returns to the rule left with the back button of the detail', async () => {
    const sheet = await openAutomations(demoClient());
    openRule(sheet, 'Tibor');
    backToList(sheet);
    expect(detail(sheet, 'Tibor')).toBeNull();

    release(3);

    expect(detail(sheet, 'Tibor')).not.toBeNull();
  });

  it('saves a rule name still being typed before going back', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');
    click(within(tibor).getByRole('button', { name: 'Premenovať pravidlo Tibor' }));
    const name = within(tibor).getByLabelText('Názov pravidla');
    expect(document.activeElement).toBe(name);
    change(name, 'Tibor Novák');

    release(3);
    await settle();

    expect(await stored(client, 'Tibor Novák')).toBeDefined();
    release(4);
    expect(detail(sheet, 'Tibor Novák')).not.toBeNull();
  });

  it('shows the list when the rule of a visited detail was removed', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');
    click(within(tibor).getByRole('button', { name: 'Odstrániť pravidlo' }));
    await settle();
    expect(await stored(client, 'Tibor')).toBeUndefined();

    release(3);

    expect(detail(sheet, 'Tibor')).toBeNull();
    expect(within(sheet).getByRole('list', { name: 'Pravidlá' })).toBeDefined();
  });

  it('keeps a saved new rule reachable from the templates', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));
    click(within(sheet).getByRole('button', { name: 'Šablóna Úlohy z Jiry' }));
    await settle();
    expect(await stored(client, 'Úlohy z Jiry')).toBeDefined();

    release(3);
    expect(within(sheet).getByRole('button', { name: 'Šablóna Úlohy z Jiry' })).toBeDefined();
    release(4);

    expect(detail(sheet, 'Úlohy z Jiry')).not.toBeNull();
  });

  it('leaves the rule alone while a picker is open over the settings', async () => {
    const sheet = await openAutomations(demoClient());
    const tibor = openRule(sheet, 'Tibor');
    click(checkbox(tibor, 'Presunúť do priečinka'));
    expect(popover('Presunúť do priečinka')).toBeDefined();

    release(3);

    expect(detail(sheet, 'Tibor')).not.toBeNull();
    expect(popover('Presunúť do priečinka')).toBeDefined();
  });

  it('leaves the settings alone while a message is being written', async () => {
    await openSettings();
    act(() => {
      setUi({ overlay: { kind: 'compose', init: {}, scope: 'all' } });
    });

    release(3);

    expect(useUiStore.getState().overlay?.kind).toBe('compose');
  });
});
