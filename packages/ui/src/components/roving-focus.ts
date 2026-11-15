import type { KeyboardEvent } from 'react';

const stepOf = (key: string, vertical: boolean): number => {
  if (key === 'ArrowRight' || (vertical && key === 'ArrowDown')) {
    return 1;
  }
  if (key === 'ArrowLeft' || (vertical && key === 'ArrowUp')) {
    return -1;
  }
  return 0;
};

export const rovingIndex = (
  key: string,
  current: number,
  count: number,
  vertical: boolean,
): number | null => {
  if (count === 0) {
    return null;
  }
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return count - 1;
  }
  const step = stepOf(key, vertical);
  if (step === 0) {
    return null;
  }
  return (Math.max(current, 0) + step + count) % count;
};

export interface RovingOptions {
  readonly selector: string;
  readonly current: number;
  readonly count: number;
  readonly vertical: boolean;
}

export const moveRovingFocus = (
  event: KeyboardEvent<HTMLElement>,
  options: RovingOptions,
): number | null => {
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(options.selector)];
  const focused = items.findIndex((item) => item === event.target);
  const current = focused >= 0 ? focused : options.current;
  const target = rovingIndex(event.key, current, options.count, options.vertical);
  if (target === null) {
    return null;
  }
  event.preventDefault();
  event.stopPropagation();
  items[target]?.focus();
  return target;
};

export const rovingTabIndex = (index: number, selected: number): 0 | -1 =>
  index === Math.max(selected, 0) ? 0 : -1;
