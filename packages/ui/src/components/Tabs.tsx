import { clsx } from 'clsx';
import type { ReactNode } from 'react';

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
  return (
    <div className={className} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === active}
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
