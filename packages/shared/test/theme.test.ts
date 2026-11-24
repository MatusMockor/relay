import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_SETTINGS,
  DeviceSettingsPatchSchema,
  DeviceSettingsSchema,
  resolveTheme,
  THEME_PREFERENCES,
  themeAppearance,
} from '../src/domain';

const legacyDeviceSettings = {
  savedServers: [{ name: 'Domov', url: 'https://relay.example.com' }],
  activeServerUrl: 'https://relay.example.com',
  mode: 'synced',
  panelWidths: { sidebar: 240, list: 420, rightPanel: 320 },
  selectedAccountId: null,
};

describe('theme device setting', () => {
  it('defaults to the dark theme', () => {
    expect(DEFAULT_DEVICE_SETTINGS.theme).toBe('dark');
  });

  it('loads settings persisted before themes existed and gives them the default theme', () => {
    const parsed = DeviceSettingsSchema.parse(legacyDeviceSettings);

    expect(parsed).toEqual({ ...legacyDeviceSettings, theme: 'dark', offlineWindow: '6m' });
  });

  it('keeps a stored theme and rejects an unknown one', () => {
    expect(DeviceSettingsSchema.parse({ ...legacyDeviceSettings, theme: 'paper' }).theme).toBe(
      'paper',
    );
    expect(DeviceSettingsSchema.safeParse({ ...legacyDeviceSettings, theme: 'neon' }).success).toBe(
      false,
    );
  });

  it('accepts a theme patch on its own', () => {
    expect(DeviceSettingsPatchSchema.parse({ theme: 'system' })).toEqual({ theme: 'system' });
    expect(DeviceSettingsPatchSchema.safeParse({ theme: '' }).success).toBe(false);
  });
});

describe('theme resolution', () => {
  it('offers every theme with system first', () => {
    expect(THEME_PREFERENCES).toEqual(['system', 'dark', 'light', 'black', 'dim', 'paper']);
  });

  it('follows the operating system only for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('paper', true)).toBe('paper');
    expect(resolveTheme('black', false)).toBe('black');
  });

  it('groups every resolved theme into a light or dark appearance', () => {
    expect(themeAppearance('dark')).toBe('dark');
    expect(themeAppearance('black')).toBe('dark');
    expect(themeAppearance('dim')).toBe('dark');
    expect(themeAppearance('light')).toBe('light');
    expect(themeAppearance('paper')).toBe('light');
  });
});
