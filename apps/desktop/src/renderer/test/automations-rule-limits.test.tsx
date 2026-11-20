// @vitest-environment jsdom
import { supportedAutomations } from '@relay/shared';
import type { AutomationCondition } from '@relay/shared';
import { waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toAutomationInput } from '../src/data/hooks/use-replace-automations';
import { previewRequestOf } from '../src/features/settings/automations/preview-request';
import { demoClient } from './features-support';
import { change, click, condition, openAutomations, openRule, stored } from './support/automations';
import { resetStores } from './support/render-app';

const domains = (count: number): AutomationCondition[] =>
  Array.from({ length: count }, (_, index) => ({
    type: 'fromDomain',
    domain: `firma${String(index)}.sk`,
  }));

const exceptionGroup = (region: HTMLElement, position: number): HTMLElement =>
  within(region).getByRole('group', { name: `Výnimka ${String(position)}` });

describe('Nastavenia > Automatizácie > limity a živý náhľad', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('stops adding conditions at the limit of 20', async () => {
    const client = demoClient();
    const rules = supportedAutomations(await client.listAutomations());

    await client.replaceAutomations(
      rules.map((rule) =>
        rule.name === 'Tibor'
          ? { ...toAutomationInput(rule), match: 'any', conditions: domains(20) }
          : toAutomationInput(rule),
      ),
    );
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    expect(within(tibor).getByRole('button', { name: '+ Pridať podmienku' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(tibor).getByText('Najviac 20 podmienok.')).toBeDefined();
    expect(within(tibor).getByRole('button', { name: '+ Pridať výnimku' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('refuses to preview a draft over the limits', () => {
    const base = {
      accountId: null,
      name: 'Veľa',
      enabled: true,
      order: 0,
      match: 'all' as const,
      ai: { runner: 'claude' as const, model: null, effort: null, instructions: null },
      actions: [{ type: 'archive' as const }],
    };

    expect(previewRequestOf({ ...base, conditions: domains(21), exceptions: [] }).kind).toBe(
      'invalid',
    );
    expect(
      previewRequestOf({ ...base, conditions: domains(2), exceptions: domains(21) }).kind,
    ).toBe('invalid');
    expect(previewRequestOf({ ...base, conditions: domains(20), exceptions: [] }).kind).toBe(
      'ready',
    );
    expect(previewRequestOf({ ...base, conditions: [], exceptions: [] }).kind).toBe('none');
  });

  it('previews a valid condition while it is typed and ignores an invalid one', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const gitlab = openRule(sheet, 'GitLab do Projektov');
    const preview = within(gitlab).getByRole('region', { name: 'Náhľad pravidla' });
    await waitFor(() => {
      expect(preview.textContent).toMatch(/Zachytí [1-9]/);
    });
    const initial = preview.textContent;

    click(within(gitlab).getByRole('button', { name: '+ Pridať výnimku' }));
    change(within(exceptionGroup(gitlab, 1)).getByLabelText('Adresa'), 'nie je adresa');
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(preview.textContent).toBe(initial);

    change(within(exceptionGroup(gitlab, 1)).getByLabelText('Adresa'), 'gitlab@firma.sk');

    await waitFor(() => {
      expect(preview.textContent).toContain('Zachytí 0 mailov');
    });
    expect((await stored(client, 'GitLab do Projektov'))?.exceptions).toEqual([]);
    expect(within(condition(gitlab, 1)).getByLabelText('Adresa')).toHaveProperty(
      'value',
      'gitlab@firma.sk',
    );
  });
});
