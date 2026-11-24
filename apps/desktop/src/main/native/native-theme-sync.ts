import { DEFAULT_THEME, type DeviceSettings, type ThemePreference } from '@relay/shared/domain';
import {
  type NativeThemeSource,
  nativeThemeSource,
  windowBackground,
} from '../window/window-theme';

export interface NativeThemePort {
  setSource(source: NativeThemeSource): void;
  prefersDark(): boolean;
  onUpdated(listener: () => void): () => void;
}

export interface ThemedWindows {
  setBackground(color: string): void;
}

export interface ThemeSettingsSource {
  get(): Promise<DeviceSettings>;
  onChange(listener: (settings: DeviceSettings) => void): () => void;
}

export class NativeThemeSync {
  private preference: ThemePreference = DEFAULT_THEME;
  private changed = false;
  private stops: (() => void)[] = [];

  constructor(
    private readonly settings: ThemeSettingsSource,
    private readonly native: NativeThemePort,
    private readonly windows: ThemedWindows,
  ) {}

  async start(): Promise<void> {
    this.stops.push(
      this.settings.onChange((settings) => {
        this.changed = true;
        this.apply(settings.theme);
      }),
      this.native.onUpdated(() => {
        this.paint();
      }),
    );
    const settings = await this.settings.get();
    if (this.changed) {
      return;
    }
    this.apply(settings.theme);
  }

  stop(): void {
    this.stops.forEach((stop) => {
      stop();
    });
    this.stops = [];
  }

  current(): ThemePreference {
    return this.preference;
  }

  background(): string {
    return windowBackground(this.preference, this.native.prefersDark());
  }

  private apply(preference: ThemePreference): void {
    this.preference = preference;
    this.native.setSource(nativeThemeSource(preference));
    this.paint();
  }

  private paint(): void {
    this.windows.setBackground(this.background());
  }
}
