import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Segmented } from '../src';

afterEach(() => {
  cleanup();
});

const THEMES = [
  { value: 'dark', label: 'Tmavá' },
  { value: 'light', label: 'Svetlá', disabled: true },
  { value: 'system', label: 'Systém' },
] as const;

type Theme = (typeof THEMES)[number]['value'];

const tabIndexes = () => screen.getAllByRole('radio').map((radio) => radio.tabIndex);

describe('Segmented with disabled options', () => {
  it('skips a disabled option when moving with arrow keys', () => {
    const picked: Theme[] = [];
    render(
      <Segmented<Theme>
        label="Téma"
        value="dark"
        options={THEMES}
        onChange={(value) => picked.push(value)}
      />,
    );
    const dark = screen.getByRole('radio', { name: 'Tmavá' });
    dark.focus();

    fireEvent.keyDown(dark, { key: 'ArrowRight' });

    expect(picked).toEqual(['system']);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Systém' }));
  });

  it('moves the tab stop off a disabled selected option', () => {
    render(<Segmented<Theme> label="Téma" value="light" options={THEMES} onChange={() => {}} />);

    expect(tabIndexes()).toEqual([0, -1, -1]);
  });

  it('ignores keys and drops the tab stop when the whole group is disabled', () => {
    const picked: Theme[] = [];
    render(
      <Segmented<Theme>
        label="Téma"
        value="dark"
        options={THEMES}
        disabled
        onChange={(value) => picked.push(value)}
      />,
    );

    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Téma' }), { key: 'ArrowRight' });

    expect(picked).toEqual([]);
    expect(tabIndexes()).toEqual([-1, -1, -1]);
    expect(
      screen.getAllByRole('radio').map((radio) => (radio as HTMLButtonElement).disabled),
    ).toEqual([true, true, true]);
  });
});

describe('Segmented cards with descriptions', () => {
  it('names each card by its label and describes it by the supporting text', () => {
    render(
      <Segmented<'all' | 'none'>
        label="Upozornenia"
        value="all"
        variant="cards"
        options={[
          { value: 'all', label: 'Všetky', description: 'Každý nový mail' },
          { value: 'none', label: 'Žiadne' },
        ]}
        onChange={() => {}}
      />,
    );

    const all = screen.getByRole('radio', { name: 'Všetky' });
    expect(all.getAttribute('aria-describedby')).not.toBeNull();
    expect(document.getElementById(all.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Každý nový mail',
    );
    const none = screen.getByRole('radio', { name: 'Žiadne' });
    expect(none.hasAttribute('aria-labelledby')).toBe(false);
    expect(none.hasAttribute('aria-describedby')).toBe(false);
  });
});
