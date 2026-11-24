import {
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
  themeAppearance,
} from '@relay/shared/domain';

export type NativeThemeSource = 'system' | 'light' | 'dark';

export const THEME_QUERY_KEY = 'theme';

export const WINDOW_BACKGROUNDS: Readonly<Record<ResolvedTheme, string>> = {
  dark: '#0b0d12',
  black: '#000000',
  dim: '#1d1f24',
  light: '#f5f6f8',
  paper: '#f3efe6',
};

export const windowBackground = (preference: ThemePreference, systemDark: boolean): string =>
  WINDOW_BACKGROUNDS[resolveTheme(preference, systemDark)];

export const nativeThemeSource = (preference: ThemePreference): NativeThemeSource => {
  if (preference === 'system') {
    return 'system';
  }
  return themeAppearance(preference);
};

export const themeQuery = (preference: ThemePreference): Record<string, string> => ({
  [THEME_QUERY_KEY]: preference,
});

export const withThemeQuery = (url: string, preference: ThemePreference): string => {
  const target = new URL(url);
  target.searchParams.set(THEME_QUERY_KEY, preference);
  return target.toString();
};
