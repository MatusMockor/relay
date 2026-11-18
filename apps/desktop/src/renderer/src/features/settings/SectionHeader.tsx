import { Icon } from '@relay/ui';
import type { ReactNode } from 'react';

export interface SectionBack {
  readonly label: string;
  readonly onBack: () => void;
}

export interface SectionHeaderProps {
  readonly title: string;
  readonly back?: SectionBack;
  readonly children?: ReactNode;
}

export function SectionHeader({ title, back, children }: SectionHeaderProps) {
  return (
    <header className="sh-head">
      {back === undefined ? null : (
        <button type="button" className="sh-back" onClick={back.onBack}>
          <Icon name="back" size={14} />
          {back.label}
        </button>
      )}
      <h2>{title}</h2>
      {children === undefined ? null : <p className="lead">{children}</p>}
    </header>
  );
}
