import { type ThemePreference, ThemePreferenceSchema } from '@relay/shared';

const HINT_KEY = 'theme';

export interface HintLocation {
  readonly href: string;
}

export interface HintHistory {
  readonly state: unknown;
  replaceState(data: unknown, unused: string, url: string): void;
}

export const themeHint = (search: string): ThemePreference | null => {
  const parsed = ThemePreferenceSchema.safeParse(new URLSearchParams(search).get(HINT_KEY));
  return parsed.success ? parsed.data : null;
};

export const rememberThemeHint = (
  location: HintLocation,
  history: HintHistory,
  preference: ThemePreference,
): void => {
  const url = new URL(location.href);
  if (url.searchParams.get(HINT_KEY) === preference) {
    return;
  }
  url.searchParams.set(HINT_KEY, preference);
  history.replaceState(history.state, '', url.toString());
};
