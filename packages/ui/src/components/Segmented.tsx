import { type KeyboardEvent, useId } from 'react';
import { moveRovingFocus } from './roving-focus';

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

const tabStopOf = <V extends string>(
  options: readonly SegmentedOption<V>[],
  value: V,
  disabled: boolean,
): V | null => {
  if (disabled) {
    return null;
  }
  const enabled = options.filter((option) => option.disabled !== true);
  const selected = enabled.find((option) => option.value === value);
  return (selected ?? enabled[0])?.value ?? null;
};

export function Segmented<V extends string>({
  options,
  value,
  label,
  onChange,
  variant = 'inline',
  disabled = false,
}: SegmentedProps<V>) {
  const id = useId();
  const enabled = options.filter((option) => option.disabled !== true);
  const tabStop = tabStopOf(options, value, disabled);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || enabled.length === 0) {
      return;
    }
    const target = moveRovingFocus(event, {
      selector: '[role="radio"]:not(:disabled)',
      current: enabled.findIndex((option) => option.value === value),
      count: enabled.length,
      vertical: true,
    });
    const option = target === null ? undefined : enabled[target];
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
      {options.map((option) => {
        const off = disabled || option.disabled === true;
        const described = option.description !== undefined;
        const labelId = `${id}-${option.value}-label`;
        const descriptionId = `${id}-${option.value}-description`;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            tabIndex={option.value === tabStop ? 0 : -1}
            className={option.value === value ? 'on' : undefined}
            disabled={off}
            aria-disabled={off || undefined}
            aria-labelledby={described ? labelId : undefined}
            aria-describedby={described ? descriptionId : undefined}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.description === undefined ? (
              option.label
            ) : (
              <>
                <b id={labelId}>{option.label}</b>
                <span id={descriptionId}>{option.description}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
