import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  readonly title: string;
  readonly children?: ReactNode;
}

export function SectionHeader({ title, children }: SectionHeaderProps) {
  return (
    <header className="sh-head">
      <h2>{title}</h2>
      {children === undefined ? null : <p className="lead">{children}</p>}
    </header>
  );
}
