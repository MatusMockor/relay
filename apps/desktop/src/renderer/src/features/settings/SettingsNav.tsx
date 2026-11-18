import { Icon, Spark, type StrokeIconName } from '@relay/ui';
import type { ReactNode } from 'react';
import { useSessionStore } from '../../session/session-store';
import type { SettingsSection } from '../../state/ui-store';
import { StorageNote } from './StorageNote';

type Entry = readonly [SettingsSection, string, StrokeIconName | 'spark'];

const GROUPS: readonly (readonly [string, readonly Entry[]])[] = [
  [
    'Účet',
    [
      ['server', 'Server', 'server'],
      ['account', 'Relay účet', 'user'],
      ['devices', 'Zariadenia', 'device'],
      ['accounts', 'Účty', 'inbox'],
    ],
  ],
  [
    'Pošta',
    [
      ['splits', 'Split Inbox', 'columns'],
      ['automations', 'Automatizácie', 'bolt'],
      ['sync', 'Synchronizácia', 'refresh'],
      ['calendars', 'Kalendáre', 'calendar'],
    ],
  ],
  [
    'Aplikácia',
    [
      ['notifications', 'Notifikácie', 'bell'],
      ['ai', 'AI', 'spark'],
      ['look', 'Vzhľad', 'palette'],
      ['keys', 'Klávesové skratky', 'keyboard'],
    ],
  ],
];

const iconOf = (name: Entry[2]): ReactNode => (name === 'spark' ? <Spark /> : <Icon name={name} />);

export interface SettingsNavProps {
  readonly section: SettingsSection;
  readonly onSelect: (section: SettingsSection) => void;
}

export function SettingsNav({ section, onSelect }: SettingsNavProps) {
  const synced = useSessionStore((state) => state.services?.mode === 'synced');
  return (
    <nav className="sh-nav" aria-label="Sekcie nastavení">
      <h3>Nastavenia</h3>
      {GROUPS.map(([title, entries]) => (
        <div className="sh-grp" key={title}>
          <h5>{title}</h5>
          {entries
            .filter(([key]) => key !== 'devices' || synced)
            .map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                className={key === section ? 'on' : undefined}
                aria-current={key === section ? 'page' : undefined}
                onClick={() => {
                  onSelect(key);
                }}
              >
                {iconOf(icon)}
                {label}
              </button>
            ))}
        </div>
      ))}
      <StorageNote />
    </nav>
  );
}
