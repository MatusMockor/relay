import { Button, Kbd, Segmented, Switch } from '@relay/ui';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { useAppContext } from '../../../data/hooks/services-context';
import { ALT } from '../../../lib/platform-keys';
import { type RightTab, setUi, useUiStore } from '../../../state/ui-store';
import { useLayout } from '../../shell/use-layout';
import { SettingRow } from '../SettingRow';
import { useUpdateSettings } from '../use-update-settings';

export function LookSection() {
  const settings = useUserSettings();
  const update = useUpdateSettings();
  const layout = useLayout();
  const { rightOpen, rightTab } = useUiStore();
  const { platform } = useAppContext();
  const density = settings.data?.density ?? 'normal';
  return (
    <>
      <h2>Vzhľad</h2>
      <p className="lead">
        Rozloženie, šírky panelov a zvolený účet si appka pamätá aj po zatvorení.
      </p>
      <SettingRow
        title="Hustota zoznamu"
        scope="synced"
        description={
          density === 'compact'
            ? 'Riadky majú 36 px, zmestí sa viac mailov naraz'
            : 'Riadky majú 46 px, viac vzduchu medzi mailmi'
        }
      >
        <Segmented
          label="Hustota zoznamu"
          value={density}
          options={[
            { value: 'compact', label: 'Kompaktná' },
            { value: 'normal', label: 'Normálna' },
          ]}
          onChange={(value) => {
            update.mutate({ density: value });
          }}
        />
      </SettingRow>
      <SettingRow
        title="Šírky panelov"
        scope="device"
        description={`Priečinky ${String(layout.sidebar)} px, pravý panel ${String(layout.rightPanel)} px. Potiahni okraj panela, dvojklik obnoví.`}
      >
        <Button
          onClick={() => {
            setUi({ widths: { sidebar: 214, rightPanel: 300 } });
            void platform.updateDeviceSettings({ panelWidths: { sidebar: 214, rightPanel: 300 } });
          }}
        >
          Obnoviť predvolené
        </Button>
      </SettingRow>
      <SettingRow
        title="Priečinky vľavo"
        scope="device"
        description={
          layout.leftVisible
            ? 'Zobrazené. Pod šírkou 1180 px sa skryjú samy.'
            : 'Skryté, zoznam má viac miesta'
        }
      >
        <Kbd keys={['[']} />
        <Switch
          checked={layout.leftVisible}
          label="Priečinky vľavo"
          onChange={(next) => {
            setUi({ leftUser: next });
          }}
        />
      </SettingRow>
      <SettingRow
        title="Pravý panel"
        scope="device"
        description={rightOpen ? 'Kontakt, AI a Kalendár vedľa zoznamu' : 'Skrytý'}
      >
        <Kbd keys={['I']} />
        <Switch
          checked={rightOpen}
          label="Pravý panel"
          onChange={(next) => {
            setUi({ rightOpen: next });
          }}
        />
      </SettingRow>
      <SettingRow
        title="Záložka pravého panela"
        scope="device"
        description={`Prepínaš aj cez ${ALT}1, ${ALT}2 a ${ALT}3`}
      >
        <Segmented<RightTab>
          label="Záložka pravého panela"
          value={rightTab}
          options={[
            { value: 'contact', label: 'Kontakt' },
            { value: 'ai', label: 'AI' },
            { value: 'calendar', label: 'Kalendár' },
          ]}
          onChange={(value) => {
            setUi({ rightTab: value, rightOpen: true });
          }}
        />
      </SettingRow>
      <SettingRow title="Téma" description="Podľa schváleného návrhu">
        Tmavá
      </SettingRow>
    </>
  );
}
