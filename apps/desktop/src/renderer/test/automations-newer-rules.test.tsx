// @vitest-environment jsdom
import {
  AutomationEntriesSchema,
  type AutomationEntry,
  AutomationIdSchema,
  type AutomationReplaceItem,
  isKeepAutomationInput,
  type UnsupportedAutomation,
} from '@relay/shared';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, settle } from './features-support';
import { click, openAutomations, row, ruleNames } from './support/automations';
import { resetStores } from './support/render-app';

const NEWER: UnsupportedAutomation = {
  kind: 'unsupported',
  id: AutomationIdSchema.parse('automation-newer'),
  name: 'Preložiť do nemčiny',
  enabled: true,
  order: 9,
  accountId: null,
};

interface NewerServer {
  readonly client: MailClient;
  readonly replaces: AutomationReplaceItem[][];
}

const newerServer = (): NewerServer => {
  const demo = demoClient();
  const replaces: AutomationReplaceItem[][] = [];
  let kept = true;
  const withNewer = (entries: AutomationEntry[]): AutomationEntry[] =>
    kept ? [...entries, NEWER] : entries;
  return {
    replaces,
    client: {
      ...demo,
      listAutomations: async () => withNewer(await demo.listAutomations()),
      replaceAutomations: async (items) => {
        replaces.push(items);
        kept = items.some((item) => isKeepAutomationInput(item) && item.id === NEWER.id);
        return withNewer(
          await demo.replaceAutomations(items.filter((item) => !isKeepAutomationInput(item))),
        );
      },
    },
  };
};

describe('Nastavenia > Automatizácie > pravidlá z novšej verzie', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('reads a newer rule from the server list next to the rules it understands', () => {
    const parsed = AutomationEntriesSchema.parse([
      {
        id: 'automation-newer',
        userId: 'user-1',
        accountId: null,
        name: 'Preložiť do nemčiny',
        enabled: true,
        order: 9,
        preset: null,
        match: 'all',
        conditions: [{ type: 'fromDomain', domain: 'firma.de' }],
        exceptions: [],
        ai: { runner: 'claude', model: null, effort: null, instructions: null },
        actions: [{ type: 'translate', language: 'de' }],
      },
    ]);

    expect(parsed).toEqual([NEWER]);
  });

  it('shows a newer rule read-only and keeps it when another rule changes', async () => {
    const server = newerServer();
    const sheet = await openAutomations(server.client);
    const newer = row(sheet, NEWER.name);

    expect(ruleNames(sheet).at(-1)).toBe(`Pravidlo ${NEWER.name}`);
    expect(
      within(newer).getByText('Pravidlo z novšej verzie Relay, aktualizuj aplikáciu'),
    ).toBeDefined();
    expect(within(newer).queryByRole('button')).toBeNull();
    expect(within(newer).queryByRole('switch')).toBeNull();
    click(within(row(sheet, 'Tibor')).getByRole('switch', { name: 'Pravidlo Tibor zapnuté' }));
    await settle();

    expect(server.replaces.at(-1)?.at(-1)).toEqual({ id: NEWER.id, keep: true });
    expect(ruleNames(sheet).at(-1)).toBe(`Pravidlo ${NEWER.name}`);
  });
});
