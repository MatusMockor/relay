// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelChoice } from '../src/features/settings/automations/model-choice';
import { ModelPicker } from '../src/features/settings/automations/ModelPicker';

const choices: ModelChoice[] = [];

function Harness({ initial }: { readonly initial: ModelChoice }) {
  const [value, setValue] = useState(initial);
  return (
    <ModelPicker
      value={value}
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
    expect(trigger().getAttribute('aria-label')).toBe('Model AI: Claude Code, Claude Opus 5.5');

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
    expect(trigger().textContent).toBe('OGPT-6 AstraVysoký');
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
});
