import { Segmented } from '@relay/ui';
import type { NotificationMode } from '@relay/shared';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { setUi } from '../../../state/ui-store';
import { SettingRow } from '../SettingRow';
import { useUpdateSettings } from '../use-update-settings';

const DESCRIPTIONS: Readonly<Record<NotificationMode, string>> = {
  off: 'Žiadne notifikácie. Poštu otvoríš, keď sa rozhodneš ty.',
  digest: 'Jedna notifikácia s počtom nových mailov v záložke Dôležité, napr. „Máš 3 nové správy“.',
  urgent:
    'Notifikácia pri každom novom maile v záložke Dôležité s odosielateľom a predmetom. Maily v ostatných splitoch prídu potichu.',
};

const openAutomations = () => {
  setUi({ overlay: { kind: 'settings', section: 'automations', adding: false } });
};

export function NotificationsSection() {
  const settings = useUserSettings();
  const update = useUpdateSettings();
  const mode = settings.data?.notifications ?? 'off';
  return (
    <>
      <h2>Notifikácie</h2>
      <p className="lead">Relay ťa vyruší, len keď o to stojíš. Predvolene je ticho.</p>
      <SettingRow
        title="Notifikácie na ploche"
        scope="synced"
        description={DESCRIPTIONS[mode]}
        stacked
      >
        <Segmented<NotificationMode>
          label="Notifikácie"
          value={mode}
          options={[
            { value: 'off', label: 'Vypnuté' },
            { value: 'digest', label: 'Súhrn každých 15 min' },
            { value: 'urgent', label: 'Hneď pri dôležitých' },
          ]}
          onChange={(value) => {
            update.mutate({ notifications: value });
          }}
        />
      </SettingRow>
      <p className="hint">
        Chceš notifikácie len od konkrétnych ľudí alebo pri zmienke v Jire? Nastav si pravidlo v{' '}
        <button type="button" className="link" onClick={openAutomations}>
          Automatizáciách
        </button>
        .
      </p>
    </>
  );
}
