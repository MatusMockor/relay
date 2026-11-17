import { Segmented } from '@relay/ui';
import type { NotificationMode } from '@relay/shared';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { SettingRow } from '../SettingRow';
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
      <SectionHeader title="Notifikácie" stored>
        Relay ťa vyruší, len keď o to stojíš. Predvolene je ticho.
      </SectionHeader>
      <SettingRow title="Notifikácie na ploche" description="Platí pre všetky účty a splity">
        <Segmented<NotificationMode>
          label="Notifikácie"
          value={mode}
          options={MODES.map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            update.mutate({ notifications: value });
          }}
        />
      </SettingRow>
      <ul className="modes">
        {MODES.map(([value, label, text]) => (
          <li key={value} className={value === mode ? 'on' : undefined}>
            <b>{label}</b>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
