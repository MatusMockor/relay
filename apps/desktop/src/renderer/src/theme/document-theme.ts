import { type MatchMedia, mediaColorScheme } from './color-scheme-query';
import { ThemeController, type ThemeTarget } from './theme-controller';

export interface ThemeHost {
  readonly document: Document;
  readonly matchMedia?: MatchMedia;
}

export const documentThemeTarget = (root: HTMLElement): ThemeTarget => ({
  show: (theme) => {
    root.dataset.theme = theme;
  },
});

export const createDocumentThemeController = (host: ThemeHost = window): ThemeController =>
  new ThemeController(
    documentThemeTarget(host.document.documentElement),
    mediaColorScheme(host.matchMedia?.bind(host)),
  );
