export interface ColorSchemeQuery {
  prefersDark(): boolean;
  onChange(listener: () => void): () => void;
}

export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export type MatchMedia = (query: string) => MediaQueryListLike;

const DARK_QUERY = '(prefers-color-scheme: dark)';

const alwaysDark: ColorSchemeQuery = {
  prefersDark: () => true,
  onChange: () => () => undefined,
};

export const mediaColorScheme = (matchMedia: MatchMedia | undefined): ColorSchemeQuery => {
  if (matchMedia === undefined) {
    return alwaysDark;
  }
  const list = matchMedia(DARK_QUERY);
  return {
    prefersDark: () => list.matches,
    onChange: (listener) => {
      list.addEventListener('change', listener);
      return () => {
        list.removeEventListener('change', listener);
      };
    },
  };
};
