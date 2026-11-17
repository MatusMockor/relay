import type { ReactNode } from 'react';
import { ScopeBadge } from './SettingRow';

export interface SectionHeaderProps {
  readonly title: string;
  readonly stored?: boolean;
  readonly children?: ReactNode;
}

export function SectionHeader({ title, stored = false, children }: SectionHeaderProps) {
  return (
    <header className="sh-head">
      <div className="sh-t">
        <h2>{title}</h2>
        {stored ? <ScopeBadge scope="synced" /> : null}
      </div>
      {children === undefined ? null : <p className="lead">{children}</p>}
    </header>
  );
}
