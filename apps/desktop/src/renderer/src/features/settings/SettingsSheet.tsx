import { Sheet } from '@relay/ui';
import type { ReactNode } from 'react';
import { useSessionStore } from '../../session/session-store';
import { type SettingsSection, setUi } from '../../state/ui-store';
import { AccountSection } from './sections/AccountSection';
import { AccountsSection } from './sections/AccountsSection';
import { AiSection } from './sections/AiSection';
import { DevicesSection } from './sections/DevicesSection';
import { KeysSection } from './sections/KeysSection';
import { LookSection } from './sections/LookSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { ServerSection } from './sections/ServerSection';
import { SplitsSection } from './sections/SplitsSection';
import { SyncSection } from './sections/SyncSection';

const SECTIONS: readonly (readonly [SettingsSection, string])[] = [
  ['server', 'Server'],
  ['account', 'Účet'],
  ['devices', 'Zariadenia'],
  ['accounts', 'Účty'],
  ['splits', 'Split Inbox'],
  ['sync', 'Synchronizácia'],
  ['notifications', 'Notifikácie'],
  ['ai', 'AI'],
  ['look', 'Vzhľad'],
  ['keys', 'Klávesové skratky'],
];

const render = (section: SettingsSection, adding: boolean): ReactNode => {
  const map: Record<SettingsSection, () => ReactNode> = {
    server: () => <ServerSection />,
    account: () => <AccountSection />,
    devices: () => <DevicesSection />,
    accounts: () => <AccountsSection adding={adding} />,
    splits: () => <SplitsSection />,
    sync: () => <SyncSection />,
    notifications: () => <NotificationsSection />,
    ai: () => <AiSection />,
    look: () => <LookSection />,
    keys: () => <KeysSection />,
  };
  return map[section]();
};

export function SettingsSheet({
  section,
  adding,
}: {
  readonly section: SettingsSection;
  readonly adding: boolean;
}) {
  const synced = useSessionStore((state) => state.services?.mode === 'synced');
  const mode = useSessionStore((state) => state.services?.mode);
  const visible = SECTIONS.filter(([key]) => key !== 'devices' || synced);
  const go = (next: SettingsSection) => {
    setUi({ overlay: { kind: 'settings', section: next, adding: false } });
  };
  const close = () => {
    setUi({ overlay: null });
  };
  const onKey = (event: KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === 'Escape' && adding) {
      event.preventDefault();
      go('accounts');
      return true;
    }
    if (mod && event.key === ',') {
      event.preventDefault();
      close();
      return true;
    }
    return false;
  };
  return (
    <Sheet label="Nastavenia" className="sheet" onClose={close} onKey={onKey}>
      <nav className="sh-nav" aria-label="Sekcie nastavení">
        <h3>Nastavenia</h3>
        {visible.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={key === section ? 'on' : undefined}
            aria-current={key === section ? 'page' : undefined}
            onClick={() => {
              go(key);
            }}
          >
            {label}
          </button>
        ))}
        {mode === 'demo' ? <span className="proto">Ukážkové dáta</span> : null}
      </nav>
      <div className="sh-main">{render(section, adding)}</div>
    </Sheet>
  );
}
