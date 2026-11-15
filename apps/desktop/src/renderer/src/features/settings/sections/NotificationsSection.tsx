import { Segmented } from '@relay/ui';
import type { NotificationMode } from '@relay/shared';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { SettingRow } from '../SettingRow';
import { useUpdateSettings } from '../use-update-settings';

const DESCRIPTIONS: Readonly<Record<NotificationMode, string>> = {
  off: 'Vypnuté. Pošta ťa nevyrušuje, keď pracuješ.',
  digest: 'Raz za čas súhrn toho, čo prišlo do Dôležitých.',
  urgent: 'Len Dôležité a zmienky v Jire, ostatné splity prídu potichu.',
};

export function NotificationsSection() {
  const settings = useUserSettings();
  const update = useUpdateSettings();
  const mode = settings.data?.notifications ?? 'off';
  return (
    <>
      <h2>Notifikácie</h2>
      <p className="lead">Predvolene vypnuté. Pošta ťa nemá vyrušovať, keď pracuješ.</p>
      <SettingRow title="Notifikácie na ploche" scope="synced" description={DESCRIPTIONS[mode]}>
        <Segmented<NotificationMode>
          label="Notifikácie"
          value={mode}
          options={[
            { value: 'off', label: 'Vypnuté' },
            { value: 'digest', label: 'Súhrn' },
            { value: 'urgent', label: 'Len dôležité' },
          ]}
          onChange={(value) => {
            update.mutate({ notifications: value });
          }}
        />
      </SettingRow>
    </>
  );
}
