import {
  DEFAULT_THEME,
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from '@relay/shared';
import type { ColorSchemeQuery } from './color-scheme-query';

export interface ThemeTarget {
  show(theme: ResolvedTheme): void;
}

export class ThemeController {
  private preference: ThemePreference = DEFAULT_THEME;
  private chosen = false;
  private hydration: Promise<void> | null = null;
  private stopWatching: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly target: ThemeTarget,
    private readonly scheme: ColorSchemeQuery,
  ) {}

  readonly current = (): ThemePreference => this.preference;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  preview(preference: ThemePreference): void {
    this.show(preference);
  }

  choose(preference: ThemePreference): void {
    this.chosen = true;
    this.show(preference);
  }

  hydrate(load: () => Promise<ThemePreference>): Promise<void> {
    this.hydration ??= load()
      .then((preference) => {
        if (this.chosen) {
          return;
        }
        this.show(preference);
      })
      .catch(() => undefined);
    return this.hydration;
  }

  dispose(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    this.listeners.clear();
  }

  private show(preference: ThemePreference): void {
    this.preference = preference;
    this.watch(preference);
    this.paint();
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private watch(preference: ThemePreference): void {
    this.stopWatching?.();
    this.stopWatching =
      preference === 'system'
        ? this.scheme.onChange(() => {
            this.paint();
          })
        : null;
  }

  private paint(): void {
    this.target.show(resolveTheme(this.preference, this.scheme.prefersDark()));
  }
}
