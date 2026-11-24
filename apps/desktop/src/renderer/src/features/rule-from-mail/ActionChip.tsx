import { cx } from '@relay/ui';
import type { MouseEvent } from 'react';

export interface ActionChipProps {
  readonly label: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly note?: string;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function ActionChip({ label, on, disabled, note, onClick }: ActionChipProps) {
  return (
    <button
      type="button"
      className={cx('chipb', 'rfm-chip', on && 'on')}
      aria-pressed={on}
      title={note}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
