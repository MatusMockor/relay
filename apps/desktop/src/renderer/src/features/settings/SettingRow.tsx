import type { ReactNode } from 'react';
import { useSessionStore } from '../../session/session-store';

export type SettingScope = 'synced' | 'device';

export function ScopeBadge({ scope }: { readonly scope: SettingScope }) {
  const synced = useSessionStore((state) => state.services?.mode === 'synced');
  if (scope === 'device') {
    return <span className="scope">Len toto zariadenie</span>;
  }
  return (
    <span className={`scope${synced ? ' synced' : ''}`}>
      {synced ? 'Synchronizuje sa' : 'Uložené v appke'}
    </span>
  );
}

export interface SettingRowProps {
  readonly title: string;
  readonly description?: string;
  readonly scope?: SettingScope;
  readonly children?: ReactNode;
}

export function SettingRow({ title, description, scope, children }: SettingRowProps) {
  return (
    <div className="srow">
      <div className="l">
        <b>
          {title}
          {scope === 'device' ? <ScopeBadge scope={scope} /> : null}
        </b>
        {description === undefined ? null : <span>{description}</span>}
      </div>
      <div className="r">{children}</div>
    </div>
  );
}
