import type { KeyboardEvent } from 'react';
import { moveRovingFocus, rovingTabIndex } from './roving-focus';

export interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: string;
}

export interface SegmentedProps<V extends string> {
  readonly options: readonly SegmentedOption<V>[];
  readonly value: V;
  readonly label: string;
  readonly onChange: (value: V) => void;
}

export function Segmented<V extends string>({
  options,
  value,
  label,
  onChange,
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
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={rovingTabIndex(index, selected)}
          className={option.value === value ? 'on' : undefined}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
