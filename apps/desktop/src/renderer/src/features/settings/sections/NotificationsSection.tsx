import { Segmented } from '@relay/ui';
import type { NotificationMode } from '@relay/shared';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { SettingsGroup } from '../SettingsGroup';
import { useUpdateSettings } from '../use-update-settings';
import { SectionHeader } from '../SectionHeader';

const MODES: readonly (readonly [NotificationMode, string, string])[] = [
  ['off', 'Vypnuté', 'Žiadne notifikácie. Poštu otvoríš, keď sa rozhodneš ty.'],
  ['digest', 'Súhrn', 'Raz za čas jeden súhrn toho, čo prišlo do Dôležitých.'],
  ['urgent', 'Len dôležité', 'Dôležité a zmienky v Jire hneď, ostatné splity potichu.'],
];

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
      <p className="sh-note">Platí pre všetky účty a splity.</p>
    </>
  );
}
