import { Segmented } from '@relay/ui';
import { SettingRow } from '../SettingRow';

type Theme = 'dark' | 'light' | 'system';

const THEMES = [
  { value: 'dark', label: 'Tmavá' },
  { value: 'light', label: 'Svetlá', disabled: true },
  { value: 'system', label: 'Systém', disabled: true },
] as const;

export function ThemeRow() {
  return (
    <SettingRow title="Téma" description="Svetlá a systémová téma čoskoro.">
      <Segmented<Theme> label="Téma" value="dark" options={THEMES} onChange={() => undefined} />
    </SettingRow>
  );
}
