import { Icon, Spark, Tabs } from '@relay/ui';
import { ALT } from '../../lib/platform-keys';
import { type RightTab, useUiStore } from '../../state/ui-store';
import { openRight } from '../mail/navigation';
import { AiChatPane } from './AiChatPane';
import { CalendarPane } from './CalendarPane';
import { ContactPane, useContactIdle } from './ContactPane';

const TABS = [
  { key: 'ai' as const, label: 'AI', icon: <Spark />, hint: `AI (${ALT}2)` },
  {
    key: 'calendar' as const,
    label: 'Kalendár',
    icon: <Icon name="calendar" />,
    hint: `Kalendár (${ALT}3)`,
  },
];

const firstTab = (idle: boolean) => ({
  key: 'contact' as const,
  label: idle ? 'Prehľad' : 'Kontakt',
  icon: <Icon name={idle ? 'sun' : 'user'} />,
  hint: `${idle ? 'Prehľad' : 'Kontakt'} (${ALT}1)`,
});

export function RightPanel({ width }: { readonly width: number }) {
  const tab = useUiStore((state) => state.rightTab);
  const idle = useContactIdle();
  const first = firstTab(idle);
  return (
    <aside className="side" id="side" aria-label="Pravý panel" style={{ width }}>
      <Tabs<RightTab>
        className="stabs"
        label="Pravý panel"
        items={[first, ...TABS]}
        active={tab}
        onSelect={openRight}
      />
      {tab === 'contact' ? (
        <div className="spane" role="tabpanel" aria-label={first.label}>
          <ContactPane />
        </div>
      ) : null}
      {tab === 'ai' ? <AiChatPane /> : null}
      {tab === 'calendar' ? <CalendarPane /> : null}
    </aside>
  );
}
