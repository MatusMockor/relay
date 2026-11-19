// @vitest-environment jsdom
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoClient, settle } from './features-support';
import { click, openAutomations, row, ruleNames, stored } from './support/automations';
import { resetStores } from './support/render-app';

const dragData = () => ({
  dataTransfer: {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: () => undefined,
    setDragImage: () => undefined,
  },
});

describe('Nastavenia > Automatizácie > zoznam', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('lists every rule as one row with a readable summary', async () => {
    const sheet = await openAutomations(demoClient());
    const mentions = row(sheet, 'Jira spomenutia');

    expect(ruleNames(sheet)).toEqual([
      'Pravidlo Jira spomenutia',
      'Pravidlo Tibor',
      'Pravidlo GitLab do Projektov',
      'Pravidlo Jira tasky',
    ]);
    expect(
      within(mentions).getByRole('button', { name: 'Otvoriť pravidlo Jira spomenutia' })
        .textContent,
    ).toContain('Jira udalosť je Spomenutie a projekt je ECOM → AI zhrnutie, Vytvoriť úlohu');
    expect(within(mentions).getByText('eFabrica')).toBeDefined();
    expect(within(row(sheet, 'Tibor')).getByText('Všetky účty')).toBeDefined();
    expect(within(row(sheet, 'Jira tasky')).getByText('Predvolené')).toBeDefined();
    expect(within(row(sheet, 'Jira tasky')).getByText(/^Z Jiry → Vytvoriť úlohu$/)).toBeDefined();
    expect(row(sheet, 'Jira tasky').className).toContain('off');
  });

  it('toggles a rule from the list', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);

    click(within(row(sheet, 'Tibor')).getByRole('switch', { name: 'Pravidlo Tibor zapnuté' }));
    await settle();

    expect((await stored(client, 'Tibor'))?.enabled).toBe(false);
  });

  it('reorders rules with the keyboard', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const handle = within(row(sheet, 'Tibor')).getByRole('button', {
      name: 'Presunúť pravidlo Tibor',
    });

    act(() => {
      handle.focus();
      fireEvent.keyDown(handle, { key: 'ArrowUp', altKey: true });
    });
    await settle();

    expect((await client.listAutomations()).map((rule) => [rule.name, rule.order])).toEqual([
      ['Tibor', 0],
      ['Jira spomenutia', 1],
      ['GitLab do Projektov', 2],
      ['Jira tasky', 3],
    ]);
    expect(ruleNames(sheet)[0]).toBe('Pravidlo Tibor');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Presunúť pravidlo Tibor');
  });

  it('ignores arrow keys without Alt and moves past the edges', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const first = within(row(sheet, 'Jira spomenutia')).getByRole('button', {
      name: 'Presunúť pravidlo Jira spomenutia',
    });

    act(() => {
      fireEvent.keyDown(first, { key: 'ArrowDown' });
      fireEvent.keyDown(first, { key: 'ArrowUp', altKey: true });
    });
    await settle();

    expect((await client.listAutomations()).map((rule) => rule.name)).toEqual([
      'Jira spomenutia',
      'Tibor',
      'GitLab do Projektov',
      'Jira tasky',
    ]);
  });

  it('reorders rules by dragging a row', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const handle = within(row(sheet, 'Jira spomenutia')).getByRole('button', {
      name: 'Presunúť pravidlo Jira spomenutia',
    });

    act(() => {
      fireEvent.dragStart(handle, dragData());
    });
    act(() => {
      fireEvent.dragOver(row(sheet, 'GitLab do Projektov'), dragData());
    });
    expect(row(sheet, 'GitLab do Projektov').className).toContain('drop-below');
    act(() => {
      fireEvent.drop(row(sheet, 'GitLab do Projektov'), dragData());
    });
    await settle();

    expect((await client.listAutomations()).map((rule) => [rule.name, rule.order])).toEqual([
      ['Tibor', 0],
      ['GitLab do Projektov', 1],
      ['Jira spomenutia', 2],
      ['Jira tasky', 3],
    ]);
  });
});
