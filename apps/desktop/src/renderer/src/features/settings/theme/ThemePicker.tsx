import type { ThemePreference } from '@relay/shared';
import { cx, moveRovingFocus, rovingTabIndex } from '@relay/ui';
import type { KeyboardEvent } from 'react';
import { THEME_OPTIONS } from './theme-options';
import { ThemePreview } from './ThemePreview';

export interface ThemePickerProps {
  readonly value: ThemePreference;
  readonly label: string;
  readonly onChange: (value: ThemePreference) => void;
}

export function ThemePicker({ value, label, onChange }: ThemePickerProps) {
  const selected = THEME_OPTIONS.findIndex((option) => option.value === value);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = moveRovingFocus(event, {
      selector: '[role="radio"]',
      current: selected,
      count: THEME_OPTIONS.length,
      vertical: true,
    });
    const option = target === null ? undefined : THEME_OPTIONS[target];
    if (option === undefined || option.value === value) {
      return;
    }
    onChange(option.value);
  };
  return (
    <div className="thm-pick" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {THEME_OPTIONS.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={rovingTabIndex(index, selected)}
          className={cx('thm-card', option.value === value && 'on')}
          onClick={() => {
            onChange(option.value);
          }}
        >
          <ThemePreview theme={option.value} />
          <span className="thm-name">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
