import { Segmented } from '@relay/ui';
import { SettingRow } from '../SettingRow';

type Theme = 'dark' | 'light' | 'system';

const THEMES = [
  { value: 'dark', label: 'Tmavá' },
  { value: 'light', label: 'Svetlá', disabled: true, badge: 'čoskoro' },
  { value: 'system', label: 'Systém', disabled: true, badge: 'čoskoro' },
] as const;

export function ThemeRow() {
  return (
    <SettingRow title="Téma" description="Farby aplikácie">
      <Segmented<Theme> label="Téma" value="dark" options={THEMES} onChange={() => undefined} />
    </SettingRow>
  );
}
