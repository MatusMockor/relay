import { Segmented } from '@relay/ui';
import { SettingRow } from '../SettingRow';

export function ThemeRow() {
  return (
    <SettingRow title="Téma" description="Svetlá a systémová téma čoskoro.">
      <Segmented<'dark'>
        label="Téma"
        value="dark"
        options={[{ value: 'dark', label: 'Tmavá' }]}
        onChange={() => undefined}
      />
    </SettingRow>
  );
}
