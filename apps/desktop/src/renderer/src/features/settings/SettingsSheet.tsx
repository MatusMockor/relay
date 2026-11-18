import { Icon, IconButton, Kbd, Sheet } from '@relay/ui';
import type { ReactNode } from 'react';
import { type SettingsSection, setUi } from '../../state/ui-store';
import { AccountSection } from './sections/AccountSection';
import { AccountsSection } from './sections/AccountsSection';
import { AiSection } from './sections/AiSection';
import { AutomationsSection } from './sections/AutomationsSection';
import { CalendarsSection } from './sections/CalendarsSection';
import { DevicesSection } from './sections/DevicesSection';
import { KeysSection } from './sections/KeysSection';
import { LookSection } from './sections/LookSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { ServerSection } from './sections/ServerSection';
import { SplitsSection } from './sections/SplitsSection';
import { SyncSection } from './sections/SyncSection';
import { SettingsNav } from './SettingsNav';

const render = (section: SettingsSection, adding: boolean): ReactNode => {
  const map: Record<SettingsSection, () => ReactNode> = {
    server: () => <ServerSection />,
    account: () => <AccountSection />,
    devices: () => <DevicesSection />,
    accounts: () => <AccountsSection adding={adding} />,
    splits: () => <SplitsSection />,
    automations: () => <AutomationsSection />,
    sync: () => <SyncSection />,
    notifications: () => <NotificationsSection />,
    ai: () => <AiSection />,
    look: () => <LookSection />,
    keys: () => <KeysSection />,
    calendars: () => <CalendarsSection />,
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
      <SettingsNav section={section} onSelect={go} />
      <div className="sh-close">
        <Kbd keys={['Esc']} />
        <IconButton label="Zavrieť nastavenia" onClick={close}>
          <Icon name="x" />
        </IconButton>
      </div>
      <div className="sh-main">{render(section, adding)}</div>
    </Sheet>
  );
}
