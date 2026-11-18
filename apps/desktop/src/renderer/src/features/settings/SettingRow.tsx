import type { ReactNode } from 'react';

export interface SettingRowProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
}

export function SettingRow({ title, description, children }: SettingRowProps) {
  return (
    <div className="srow">
      <div className="l">
        <b>{title}</b>
        {description === undefined ? null : <span>{description}</span>}
      </div>
      <div className="r">{children}</div>
    </div>
  );
}
