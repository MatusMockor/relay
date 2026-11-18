import { FolderIcon, Icon, rovingIndex, Spark, type StrokeIconName } from '@relay/ui';
import type { KeyboardEvent, ReactNode } from 'react';
import { useSessionStore } from '../../session/session-store';
import type { SettingsSection } from '../../state/ui-store';
import { StorageNote } from './StorageNote';

type Entry = readonly [SettingsSection, string, StrokeIconName | 'spark' | 'label'];

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
      ['labels', 'Štítky', 'label'],
      ['automations', 'Automatizácie', 'bolt'],
      ['jira', 'Jira', 'check'],
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
      ['about', 'O aplikácii', 'info'],
    ],
  ],
];

const iconOf = (name: Entry[2]): ReactNode => {
  if (name === 'spark') {
    return <Spark />;
  }
  if (name === 'label') {
    return <FolderIcon name="label" />;
  }
  return <Icon name={name} />;
};

export const SETTINGS_PANEL_ID = 'settings-panel';

export const settingsTabId = (section: SettingsSection): string => `settings-tab-${section}`;

export interface SettingsNavProps {
  readonly section: SettingsSection;
  readonly onSelect: (section: SettingsSection) => void;
}

export function SettingsNav({ section, onSelect }: SettingsNavProps) {
  const synced = useSessionStore((state) => state.services?.mode === 'synced');
  const visible = (entries: readonly Entry[]) =>
    entries.filter(([key]) => key !== 'devices' || synced);
  const order = GROUPS.flatMap(([, entries]) => visible(entries).map(([key]) => key));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = rovingIndex(event.key, order.indexOf(section), order.length, true);
    const next = target === null ? undefined : order[target];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    onSelect(next);
    document.getElementById(settingsTabId(next))?.focus();
  };
  return (
    <div className="sh-nav">
      <h3>Nastavenia</h3>
      <div
        className="sh-tabs"
        role="tablist"
        aria-orientation="vertical"
        aria-label="Sekcie nastavení"
        onKeyDown={onKeyDown}
      >
        {GROUPS.map(([title, entries]) => (
          <div className="sh-grp" role="none" key={title}>
            <h5 aria-hidden="true">{title}</h5>
            {visible(entries).map(([key, label, icon]) => (
              <button
                key={key}
                id={settingsTabId(key)}
                type="button"
                role="tab"
                className={key === section ? 'on' : undefined}
                aria-selected={key === section}
                aria-controls={SETTINGS_PANEL_ID}
                tabIndex={key === section ? 0 : -1}
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
      </div>
      <StorageNote />
    </div>
  );
}
