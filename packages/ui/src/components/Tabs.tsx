import { clsx } from 'clsx';
import type { KeyboardEvent, ReactNode } from 'react';
import { moveRovingFocus, rovingTabIndex } from './roving-focus';

export interface TabItem<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly hint?: string;
}

export interface TabsProps<K extends string> {
  readonly items: readonly TabItem<K>[];
  readonly active: K;
  readonly label: string;
  readonly className?: string;
  readonly onSelect: (key: K) => void;
  readonly trailing?: ReactNode;
}

export function Tabs<K extends string>({
  items,
  active,
  label,
  className,
  onSelect,
  trailing,
}: TabsProps<K>) {
  const selected = items.findIndex((item) => item.key === active);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'tab') {
      return;
    }
    const target = moveRovingFocus(event, {
      selector: '[role="tab"]',
      current: selected,
      count: items.length,
      vertical: false,
    });
    const item = target === null ? undefined : items[target];
    if (item === undefined || item.key === active) {
      return;
    }
    onSelect(item.key);
  };
  return (
    <div className={className} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === active}
          tabIndex={rovingTabIndex(index, selected)}
          title={item.hint}
          className={clsx('stab', item.key === active && 'on')}
          onClick={() => {
            onSelect(item.key);
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
      {trailing}
    </div>
  );
}
