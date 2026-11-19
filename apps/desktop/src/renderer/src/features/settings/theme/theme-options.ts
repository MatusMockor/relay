import type { ThemePreference } from '@relay/shared';

export interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
  readonly description: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    value: 'system',
    label: 'Podľa systému',
    description: 'Svetlá alebo tmavá podľa nastavenia systému, prepne sa sama',
  },
  { value: 'dark', label: 'Tmavá', description: 'Pôvodná tmavá paleta Relay' },
  { value: 'light', label: 'Svetlá', description: 'Svetlé pozadie a tmavý text, vhodná cez deň' },
  { value: 'black', label: 'Čierna', description: 'Čisto čierne pozadie, šetrí OLED displeje' },
  { value: 'dim', label: 'Šerá', description: 'Mäkšia sivá s nižším kontrastom, šetrí oči večer' },
  { value: 'paper', label: 'Papier', description: 'Teplá lomená biela, príjemná na dlhé čítanie' },
];

export const themeDescription = (value: ThemePreference): string =>
  THEME_OPTIONS.find((option) => option.value === value)?.description ?? '';
