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

const open = () => {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /^Model AI:/ }));
  });
  return screen.getByRole('menu', { name: 'Model AI' });
};

const pick = (menu: HTMLElement, group: string, option: string) => {
  act(() => {
    fireEvent.click(
      within(within(menu).getByRole('group', { name: group })).getByRole('menuitemradio', {
        name: new RegExp(`^${option}`),
      }),
    );
  });
};

const optionsOf = (menu: HTMLElement, group: string): string[] =>
  within(within(menu).getByRole('group', { name: group }))
    .getAllByRole('menuitemradio')
    .map((item) => item.textContent);

describe('ModelPicker', () => {
  afterEach(() => {
    cleanup();
    choices.length = 0;
  });

  it('picks the provider, then a catalog model, then its effort', () => {
    render(<Harness initial={{ runner: 'claude', model: null, effort: null }} />);
    expect(screen.getByRole('button', { name: /^Model AI:/ }).textContent).toBe(
      'Claude Code · Predvolený (Claude Opus 5.5)',
    );

    const menu = open();
    expect(optionsOf(menu, 'Model')).toEqual([
      'PredvolenýClaude Opus 5.5',
      'Claude Opus 5.5',
      'Claude Sonnet 5.5',
      'Claude Haiku 5.5',
    ]);
    expect(optionsOf(menu, 'Úsilie')).toContain('Max');
    pick(menu, 'Poskytovateľ', 'Codex');
    pick(menu, 'Model', 'GPT-6 Astra');
    pick(menu, 'Úsilie', 'Vysoký');

    expect(optionsOf(menu, 'Úsilie')).toEqual([
      'Predvolené',
      'Nízky',
      'Stredný',
      'Vysoký',
      'Veľmi vysoký',
    ]);
    expect(choices.at(-1)).toEqual({ runner: 'codex', model: 'gpt-6-astra', effort: 'high' });
    expect(screen.getByRole('button', { name: /^Model AI:/ }).textContent).toBe(
      'Codex · GPT-6 Astra · Vysoký',
    );
  });

  it('resets the model and effort when the provider changes', () => {
    render(<Harness initial={{ runner: 'claude', model: 'claude-haiku-5-5', effort: 'max' }} />);

    pick(open(), 'Poskytovateľ', 'Codex');

    expect(choices).toEqual([{ runner: 'codex', model: null, effort: null }]);
  });

  it('closes on Escape', () => {
    render(<Harness initial={{ runner: 'codex', model: null, effort: null }} />);
    open();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(screen.queryByRole('menu', { name: 'Model AI' })).toBeNull();
  });
});
