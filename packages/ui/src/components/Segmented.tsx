import type { KeyboardEvent } from 'react';
import { moveRovingFocus, rovingTabIndex } from './roving-focus';

export interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface SegmentedProps<V extends string> {
  readonly options: readonly SegmentedOption<V>[];
  readonly value: V;
  readonly label: string;
  readonly onChange: (value: V) => void;
  readonly variant?: 'inline' | 'cards';
  readonly disabled?: boolean;
}

export function Segmented<V extends string>({
  options,
  value,
  label,
  onChange,
  variant = 'inline',
  disabled = false,
}: SegmentedProps<V>) {
  const selected = options.findIndex((option) => option.value === value);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = moveRovingFocus(event, {
      selector: '[role="radio"]',
      current: selected,
      count: options.length,
      vertical: true,
    });
    const option = target === null ? undefined : options[target];
    if (option === undefined || option.value === value) {
      return;
    }
    onChange(option.value);
  };
  return (
    <div
      className={variant === 'cards' ? 'seg cards' : 'seg'}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={rovingTabIndex(index, selected)}
          className={option.value === value ? 'on' : undefined}
          disabled={disabled || option.disabled === true}
          aria-disabled={disabled || option.disabled === true || undefined}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.description === undefined ? (
            option.label
          ) : (
            <>
              <b>{option.label}</b>
              <span>{option.description}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
