import { Segmented } from '@relay/ui';
import type { NotificationMode } from '@relay/shared';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { setUi } from '../../../state/ui-store';
import { SettingsGroup } from '../SettingsGroup';
import { useUpdateSettings } from '../use-update-settings';
import { SectionHeader } from '../SectionHeader';

const MODES: readonly (readonly [NotificationMode, string, string])[] = [
  ['off', 'Vypnuté', 'Žiadne notifikácie. Poštu otvoríš, keď sa rozhodneš ty.'],
  [
    'digest',
    'Súhrn každých 15 min',
    'Jedna notifikácia s počtom nových mailov v záložke Dôležité, napr. „Máš 3 nové správy“.',
  ],
  [
    'urgent',
    'Hneď pri dôležitých',
    'Notifikácia pri každom novom maile v záložke Dôležité s odosielateľom a predmetom. Maily v ostatných splitoch prídu potichu.',
  ],
];

const openAutomations = () => {
  setUi({ overlay: { kind: 'settings', section: 'automations', adding: false } });
};

export function NotificationsSection() {
  const settings = useUserSettings();
  const update = useUpdateSettings();
  const mode = settings.data?.notifications ?? 'off';
  return (
    <>
      <SectionHeader title="Notifikácie">
        Relay ťa vyruší, len keď o to stojíš. Predvolene je ticho.
      </SectionHeader>
      <SettingsGroup title="Notifikácie na ploche" />
      <Segmented<NotificationMode>
        label="Notifikácie"
        variant="cards"
        value={mode}
        options={MODES.map(([value, label, description]) => ({ value, label, description }))}
        onChange={(value) => {
          update.mutate({ notifications: value });
        }}
      />
      <p className="sh-note">
        Platí pre všetky účty. Chceš notifikácie len od konkrétnych ľudí alebo pri zmienke v Jire?
        Nastav si pravidlo v{' '}
        <button type="button" className="link" onClick={openAutomations}>
          Automatizáciách
        </button>
        .
      </p>
    </>
  );
}
