import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_SETTINGS,
  DeviceSettingsPatchSchema,
  DeviceSettingsSchema,
  offlineWindowCutoff,
} from '../src/domain';

const NOW = new Date('2026-11-20T10:00:00.000Z');

const storedBeforeOfflineWindow = {
  savedServers: [],
  activeServerUrl: null,
  mode: 'local',
  panelWidths: { sidebar: 240, list: 420, rightPanel: 320 },
  selectedAccountId: null,
  theme: 'dark',
};

describe('offline window device setting', () => {
  it('defaults to six months, also for settings stored before the setting existed', () => {
    expect(DEFAULT_DEVICE_SETTINGS.offlineWindow).toBe('6m');
    expect(DeviceSettingsSchema.parse(storedBeforeOfflineWindow).offlineWindow).toBe('6m');
  });

  it('accepts only the five offered windows in a patch', () => {
    expect(DeviceSettingsPatchSchema.parse({ offlineWindow: 'all' })).toEqual({
      offlineWindow: 'all',
    });
    expect(DeviceSettingsPatchSchema.safeParse({ offlineWindow: '2w' }).success).toBe(false);
  });

  it('turns every window into a cutoff in calendar months and keeps all mail for all', () => {
    expect(offlineWindowCutoff('3m', NOW)?.toISOString()).toBe('2026-08-20T10:00:00.000Z');
    expect(offlineWindowCutoff('6m', NOW)?.toISOString()).toBe('2026-05-20T10:00:00.000Z');
    expect(offlineWindowCutoff('1y', NOW)?.toISOString()).toBe('2025-11-20T10:00:00.000Z');
    expect(offlineWindowCutoff('5y', NOW)?.toISOString()).toBe('2021-11-20T10:00:00.000Z');
    expect(offlineWindowCutoff('all', NOW)).toBeNull();
  });
});
