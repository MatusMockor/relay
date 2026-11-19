import { cx } from '@relay/ui';
import type { ChangeEvent, ReactNode } from 'react';

export interface CheckRowProps {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly ai?: boolean;
  readonly broken?: boolean;
  readonly note?: string | null;
  readonly onToggle: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly children?: ReactNode;
}

export function CheckRow({
  label,
  checked,
  disabled,
  ai = false,
  broken = false,
  note = null,
  onToggle,
  children,
}: CheckRowProps) {
  return (
    <div className={cx('au-act', checked && 'on', broken && 'broken')}>
      <label>
        <input
          type="checkbox"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="au-lbl">{label}</span>
        {ai ? <span className="chip pri">AI</span> : null}
        {note === null ? null : <span className="au-note">{note}</span>}
      </label>
      {children}
    </div>
  );
}
