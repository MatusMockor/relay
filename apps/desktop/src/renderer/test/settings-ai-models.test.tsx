// @vitest-environment jsdom
import type { UserSettingsPatch } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient, gate, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openAiSettings = async (client: MailClient): Promise<HTMLElement> => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'ai', adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const recording = (base: MailClient, patches: UserSettingsPatch[]): MailClient => ({
  ...base,
  updateSettings: (patch) => {
    patches.push(patch);
    return base.updateSettings(patch);
  },
});

describe('AI model settings', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('saves the default model picked in the settings picker', async () => {
    const patches: UserSettingsPatch[] = [];
    const sheet = await openAiSettings(recording(demoClient(), patches));
    const trigger = await within(sheet).findByRole('button', { name: /^Predvolený model:/ });
    expect(trigger.textContent).toContain('Opus 5.5');

    act(() => {
      fireEvent.click(trigger);
    });
    const menu = screen.getByRole('dialog', { name: 'Model AI' });
    act(() => {
      fireEvent.click(within(menu).getByRole('radio', { name: /Claude Sonnet 5.5/ }));
    });

    await waitFor(() => {
      expect(patches).toEqual([
        { ai: { defaultModel: { runner: 'claude', model: 'claude-sonnet-5-5', effort: null } } },
      ]);
    });
    await waitFor(() => {
      expect(
        within(sheet).getByRole('button', { name: /^Predvolený model:/ }).textContent,
      ).toContain('Sonnet 5.5');
    });
  });

  it('keeps a background model whose CLI is not installed and warns about it', async () => {
    const base = demoClient();
    await base.updateSettings({
      ai: { backgroundModel: { runner: 'codex', model: 'gpt-6-luna', effort: 'low' } },
    });
    const client: MailClient = {
      ...base,
      listAiRunners: async () =>
        (await base.listAiRunners()).filter((runner) => runner.runner === 'claude'),
    };
    const sheet = await openAiSettings(client);

    const background = await within(sheet).findByRole('button', {
      name: 'Model na pozadí: Codex, GPT-6 Luna, nenainštalované',
    });
    expect(background.textContent).toContain('GPT-6 Luna· nenainštalované');
    const fallback = within(sheet).getByRole('button', { name: /^Predvolený model:/ });
    expect(fallback.textContent).toContain('· Predvolené');
  });

  it('keeps the model picked first when the effort is picked before the first save returns', async () => {
    const base = demoClient();
    const firstSave = gate();
    const patches: UserSettingsPatch[] = [];
    const client: MailClient = {
      ...base,
      updateSettings: async (patch) => {
        patches.push(patch);
        if (patches.length === 1) {
          await firstSave.wait();
        }
        return base.updateSettings(patch);
      },
    };
    const sheet = await openAiSettings(client);
    const trigger = await within(sheet).findByRole('button', { name: /^Predvolený model:/ });
    act(() => {
      fireEvent.click(trigger);
    });
    const menu = screen.getByRole('dialog', { name: 'Model AI' });
    act(() => {
      fireEvent.click(within(menu).getByRole('radio', { name: /Claude Sonnet 5.5/ }));
    });
    await settle();
    expect(patches).toHaveLength(1);
    act(() => {
      fireEvent.click(within(menu).getByRole('radio', { name: 'Vysoký' }));
    });
    firstSave.open();

    const sonnetHigh = { runner: 'claude', model: 'claude-sonnet-5-5', effort: 'high' };
    await waitFor(() => {
      expect(patches).toEqual([
        { ai: { defaultModel: { ...sonnetHigh, effort: null } } },
        { ai: { defaultModel: sonnetHigh } },
      ]);
    });
    await waitFor(() => {
      expect(within(sheet).getByRole('button', { name: /^Predvolený model:/ }).textContent).toBe(
        'Sonnet 5.5· Vysoký',
      );
    });
  });
});
