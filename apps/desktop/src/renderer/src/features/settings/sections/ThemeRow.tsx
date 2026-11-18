import { Segmented } from '@relay/ui';
import { SettingRow } from '../SettingRow';

type Theme = 'dark' | 'light' | 'system';

const THEMES: readonly { readonly value: Theme; readonly label: string }[] = [
  { value: 'dark', label: 'Tmavá' },
  { value: 'light', label: 'Svetlá' },
  { value: 'system', label: 'Systém' },
];

export function ThemeRow() {
  return (
    <SettingRow title="Téma" description="Svetlá téma a téma podľa systému prídu čoskoro">
      <Segmented<Theme>
        label="Téma"
        value="dark"
        options={THEMES}
        disabled
        onChange={() => undefined}
      />
    </SettingRow>
  );
}
