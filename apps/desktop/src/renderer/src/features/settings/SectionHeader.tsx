import { Icon } from '@relay/ui';
import type { ReactNode } from 'react';

export interface SectionBack {
  readonly label: string;
  readonly ariaLabel?: string;
  readonly onBack: () => void;
}

export function SectionBackButton({ label, ariaLabel, onBack }: SectionBack) {
  return (
    <button type="button" className="sh-back" aria-label={ariaLabel} onClick={onBack}>
      <Icon name="back" size={14} />
      {label}
    </button>
  );
}

export interface SectionHeaderProps {
  readonly title: string;
  readonly back?: SectionBack;
  readonly children?: ReactNode;
}

export function SectionHeader({ title, back, children }: SectionHeaderProps) {
  return (
    <header className="sh-head">
      {back === undefined ? null : <SectionBackButton {...back} />}
      <h2>{title}</h2>
      {children === undefined ? null : <p className="lead">{children}</p>}
    </header>
  );
}
