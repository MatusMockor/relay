import { Button, Segmented, Switch } from '@relay/ui';
import { useUserSettings } from '../../../data/hooks/use-mail-queries';
import { useAppContext } from '../../../data/hooks/services-context';
import { ALT } from '../../../lib/platform-keys';
import { type RightTab, setUi, useUiStore } from '../../../state/ui-store';
import { useLayout } from '../../shell/use-layout';
import { SettingRow } from '../SettingRow';
import { useUpdateSettings } from '../use-update-settings';
import { SectionHeader } from '../SectionHeader';
import { SettingsGroup } from '../SettingsGroup';
import { ThemeRow } from './ThemeRow';

export function LookSection() {
  const settings = useUserSettings();
  const update = useUpdateSettings();
  const layout = useLayout();
  const { rightOpen, rightTab } = useUiStore();
  const { platform } = useAppContext();
  const density = settings.data?.density ?? 'normal';
  return (
    <>
      <SectionHeader title="Vzhľad">
        Ako hustý je zoznam a ktoré panely vidíš. Rozloženie panelov platí len pre toto zariadenie.
      </SectionHeader>
      <SettingsGroup title="Zoznam" />
      <SettingRow
        title="Hustota zoznamu"
        description={
          density === 'compact'
            ? 'Nižšie riadky, zmestí sa viac mailov naraz'
            : 'Viac vzduchu medzi mailmi, ľahšie sa číta'
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
      <ThemeRow />
      <SettingsGroup title="Toto zariadenie" />
      <SettingRow
        title="Šírky panelov"
        description="Šírku zmeníš potiahnutím okraja panela, dvojklik na okraj ju vráti"
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
        description={
          layout.leftVisible
            ? 'Zobrazené, v úzkom okne sa skryjú samy · skratka ['
            : 'Skryté, zoznam má viac miesta · skratka ['
        }
      >
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
        description={`${rightOpen ? 'Kontakt, AI a Kalendár vedľa zoznamu' : 'Skrytý'} · skratka I`}
      >
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
    </>
  );
}
