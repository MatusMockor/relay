// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelChoice } from '../src/features/ai/model-choice/model-choice';
import { ModelPicker } from '../src/features/settings/automations/ModelPicker';

const choices: ModelChoice[] = [];

interface HarnessProps {
  readonly initial: ModelChoice;
  readonly settingsOption?: boolean;
}

function Harness({ initial, settingsOption = false }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <ModelPicker
      value={value}
      settingsOption={settingsOption}
      onChange={(next) => {
        choices.push(next);
        setValue(next);
      }}
    />
  );
}

const trigger = () => screen.getByRole('button', { name: /^Model AI:/ });

const open = () => {
  act(() => {
    fireEvent.click(trigger());
  });
  return screen.getByRole('dialog', { name: 'Model AI' });
};

const group = (menu: HTMLElement, name: string) => within(menu).getByRole('radiogroup', { name });

const pick = (menu: HTMLElement, name: string, option: string) => {
  act(() => {
    fireEvent.click(
      within(group(menu, name)).getByRole('radio', { name: new RegExp(`^${option}`) }),
    );
  });
};

const optionsOf = (menu: HTMLElement, name: string): (string | null)[] =>
  within(group(menu, name))
    .getAllByRole('radio')
    .map((item) => item.textContent);

describe('ModelPicker', () => {
  afterEach(() => {
    cleanup();
    choices.length = 0;
  });

  it('shows only the models of the chosen provider and the efforts of the chosen model', () => {
    render(<Harness initial={{ runner: 'claude', model: null, effort: null }} />);
    expect(trigger().getAttribute('aria-label')).toBe(
      'Model AI: Claude Code, Claude Opus 5.5, Predvolené',
    );

    const menu = open();
    expect(optionsOf(menu, 'Model')).toEqual([
      'Claude Opus 5.5✓',
      'Claude Sonnet 5.5',
      'Claude Haiku 5.5',
    ]);
    expect(optionsOf(menu, 'Reasoning')).toContain('Max');
    pick(menu, 'Poskytovateľ', 'Codex');

    expect(optionsOf(menu, 'Model')).toEqual(['GPT-6.1 Sol✓', 'GPT-6 Astra', 'GPT-6 Luna']);
    expect(optionsOf(menu, 'Reasoning')).toEqual(['Nízky', 'Stredný', 'Vysoký', 'Veľmi vysoký']);
    pick(menu, 'Model', 'GPT-6 Astra');
    pick(menu, 'Reasoning', 'Vysoký');

    expect(choices).toEqual([
      { runner: 'codex', model: 'gpt-6.1-sol', effort: null },
      { runner: 'codex', model: 'gpt-6-astra', effort: null },
      { runner: 'codex', model: 'gpt-6-astra', effort: 'high' },
    ]);
    expect(trigger().textContent).toBe('GPT-6 Astra· Vysoký');
  });

  it('keeps a supported effort and drops an unsupported one when the provider changes', () => {
    render(<Harness initial={{ runner: 'claude', model: 'claude-haiku-5-5', effort: 'max' }} />);

    pick(open(), 'Poskytovateľ', 'Codex');

    expect(choices).toEqual([{ runner: 'codex', model: 'gpt-6.1-sol', effort: null }]);
  });

  it('closes on Escape', () => {
    render(<Harness initial={{ runner: 'codex', model: null, effort: null }} />);
    open();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(screen.queryByRole('dialog', { name: 'Model AI' })).toBeNull();
  });

  it('offers following the settings only when asked and shows it on the trigger', () => {
    render(<Harness initial={{ runner: 'claude', model: null, effort: null }} settingsOption />);
    expect(trigger().getAttribute('aria-label')).toBe('Model AI: Podľa nastavení');
    expect(trigger().textContent).toBe('Podľa nastavení');

    const menu = open();
    expect(optionsOf(menu, 'Model')).toEqual([
      'Podľa nastavení✓',
      'Claude Opus 5.5',
      'Claude Sonnet 5.5',
      'Claude Haiku 5.5',
    ]);
    expect(within(menu).queryByRole('radiogroup', { name: 'Reasoning' })).toBeNull();
    pick(menu, 'Poskytovateľ', 'Claude Code');
    pick(menu, 'Model', 'Podľa nastavení');

    expect(choices).toEqual([
      { runner: 'claude', model: 'claude-opus-5-5', effort: null },
      { runner: 'claude', model: null, effort: null },
    ]);
  });

  it('keeps the explicit CLI default without the settings option', () => {
    render(<Harness initial={{ runner: 'claude', model: null, effort: null }} />);

    expect(optionsOf(open(), 'Model')).toEqual([
      'Claude Opus 5.5✓',
      'Claude Sonnet 5.5',
      'Claude Haiku 5.5',
    ]);
  });
});
