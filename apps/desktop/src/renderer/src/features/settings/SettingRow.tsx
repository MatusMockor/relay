import type { ReactNode } from 'react';

export interface SettingRowProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly stacked?: boolean;
}

export function SettingRow({ title, description, children, stacked = false }: SettingRowProps) {
  return (
    <div className={stacked ? 'srow stack' : 'srow'}>
      <div className="l">
        <b>{title}</b>
        {description === undefined ? null : <span>{description}</span>}
      </div>
      <div className="r">{children}</div>
    </div>
  );
}
