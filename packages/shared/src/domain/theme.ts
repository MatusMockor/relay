import { z } from 'zod';

export const ThemePreferenceSchema = z.enum(['system', 'dark', 'light', 'black', 'dim', 'paper']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export type ResolvedTheme = Exclude<ThemePreference, 'system'>;
export type ThemeAppearance = 'light' | 'dark';

export const DEFAULT_THEME: ThemePreference = 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ThemePreferenceSchema.options;

const APPEARANCE: Readonly<Record<ResolvedTheme, ThemeAppearance>> = {
  dark: 'dark',
  black: 'dark',
  dim: 'dark',
  light: 'light',
  paper: 'light',
};

export const themeAppearance = (theme: ResolvedTheme): ThemeAppearance => APPEARANCE[theme];

export const resolveTheme = (preference: ThemePreference, prefersDark: boolean): ResolvedTheme => {
  if (preference !== 'system') {
    return preference;
  }
  return prefersDark ? 'dark' : 'light';
};
