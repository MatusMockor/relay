// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { type MediaQueryListLike, mediaColorScheme } from '../src/theme/color-scheme-query';
import { createDocumentThemeController } from '../src/theme/document-theme';
import { rememberThemeHint, themeHint } from '../src/theme/theme-hint';

class FakeColorSchemeMedia implements MediaQueryListLike {
  private listeners = new Set<() => void>();

  constructor(public matches: boolean) {}

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }

  switchTo(dark: boolean): void {
    this.matches = dark;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

const controllerWith = (media: FakeColorSchemeMedia) =>
  createDocumentThemeController({ document, matchMedia: () => media });

const shownTheme = () => document.documentElement.dataset.theme;

describe('theme controller', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('shows a fixed theme on the document root', () => {
    const controller = controllerWith(new FakeColorSchemeMedia(true));

    controller.choose('paper');

    expect(shownTheme()).toBe('paper');
    expect(controller.current()).toBe('paper');
  });

  it('resolves the system preference and follows the operating system live', () => {
    const media = new FakeColorSchemeMedia(false);
    const controller = controllerWith(media);

    controller.choose('system');
    expect(shownTheme()).toBe('light');

    media.switchTo(true);
    expect(shownTheme()).toBe('dark');
    expect(controller.current()).toBe('system');
  });

  it('stops following the operating system once a fixed theme is chosen', () => {
    const media = new FakeColorSchemeMedia(true);
    const controller = controllerWith(media);
    controller.choose('system');

    controller.choose('dim');
    media.switchTo(false);

    expect(shownTheme()).toBe('dim');
    expect(media.listenerCount()).toBe(0);
  });

  it('notifies subscribers about every change', () => {
    const controller = controllerWith(new FakeColorSchemeMedia(true));
    const seen: string[] = [];
    const unsubscribe = controller.subscribe(() => seen.push(controller.current()));

    controller.preview('light');
    controller.choose('black');
    unsubscribe();
    controller.choose('dark');

    expect(seen).toEqual(['light', 'black']);
  });

  it('applies the stored theme once and never over a theme picked meanwhile', async () => {
    const controller = controllerWith(new FakeColorSchemeMedia(true));
    let release: (theme: 'light') => void = () => undefined;
    const loading = controller.hydrate(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    controller.choose('paper');
    release('light');
    await loading;
    await controller.hydrate(() => Promise.resolve('black'));

    expect(shownTheme()).toBe('paper');
  });

  it('shows the stored theme over the startup hint', async () => {
    const controller = controllerWith(new FakeColorSchemeMedia(true));
    controller.preview('light');

    await controller.hydrate(() => Promise.resolve('dim'));

    expect(shownTheme()).toBe('dim');
  });
});

describe('color scheme query', () => {
  it('treats a host without matchMedia as dark', () => {
    const query = mediaColorScheme(undefined);
    expect(query.prefersDark()).toBe(true);
    query.onChange(() => undefined)();
  });
});

describe('theme hint', () => {
  it('reads a valid theme from the document query and ignores anything else', () => {
    expect(themeHint('?theme=paper')).toBe('paper');
    expect(themeHint('?theme=system&x=1')).toBe('system');
    expect(themeHint('?theme=neon')).toBeNull();
    expect(themeHint('')).toBeNull();
  });

  it('keeps the document query in step with the latest choice so a reload starts on it', () => {
    window.history.replaceState(null, '', '/?theme=dark&lang=sk');
    rememberThemeHint(window.location, window.history, 'light');
    expect(themeHint(window.location.search)).toBe('light');
    expect(new URLSearchParams(window.location.search).get('lang')).toBe('sk');
    const writes: string[] = [];
    const history = {
      state: null,
      replaceState: (_d: unknown, _u: string, url: string) => writes.push(url),
    };
    rememberThemeHint(window.location, history, 'light');
    expect(writes).toEqual([]);
  });
});
