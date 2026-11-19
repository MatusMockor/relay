import { Icon, IconButton, Kbd, Sheet } from '@relay/ui';
import { type ReactNode, useRef } from 'react';
import { type SettingsSection, setUi } from '../../state/ui-store';
import { AboutSection } from './sections/AboutSection';
import { AccountSection } from './sections/AccountSection';
import { AccountsSection } from './sections/AccountsSection';
import { AiSection } from './sections/AiSection';
import { AutomationsSection } from './sections/AutomationsSection';
import { CalendarsSection } from './sections/CalendarsSection';
import { DevicesSection } from './sections/DevicesSection';
import { JiraSection } from './sections/JiraSection';
import { KeysSection } from './sections/KeysSection';
import { LabelsSection } from './sections/LabelsSection';
import { LookSection } from './sections/LookSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { ServerSection } from './sections/ServerSection';
import { SplitsSection } from './sections/SplitsSection';
import { SyncSection } from './sections/SyncSection';
import { SETTINGS_PANEL_ID, SettingsNav, settingsTabId } from './SettingsNav';
import { useHeaderClearance } from './use-header-clearance';
import { useSettingsFocus } from './use-settings-focus';

const render = (section: SettingsSection, adding: boolean): ReactNode => {
  const map: Record<SettingsSection, () => ReactNode> = {
    server: () => <ServerSection />,
    account: () => <AccountSection />,
    devices: () => <DevicesSection />,
    accounts: () => <AccountsSection adding={adding} />,
    splits: () => <SplitsSection />,
    labels: () => <LabelsSection />,
    automations: () => <AutomationsSection />,
    jira: () => <JiraSection />,
    sync: () => <SyncSection />,
    notifications: () => <NotificationsSection />,
    ai: () => <AiSection />,
    look: () => <LookSection />,
    keys: () => <KeysSection />,
    calendars: () => <CalendarsSection />,
    about: () => <AboutSection />,
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
  const main = useRef<HTMLDivElement>(null);
  useHeaderClearance(main, `${section}:${String(adding)}`);
  useSettingsFocus(section);
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
        {adding ? null : <Kbd keys={['Esc']} />}
        <IconButton label="Zavrieť nastavenia" onClick={close}>
          <Icon name="x" />
        </IconButton>
      </div>
      <div
        ref={main}
        className="sh-main"
        id={SETTINGS_PANEL_ID}
        role="tabpanel"
        aria-labelledby={settingsTabId(section)}
      >
        {render(section, adding)}
      </div>
    </Sheet>
  );
}
