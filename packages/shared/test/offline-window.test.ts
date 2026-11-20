import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_SETTINGS,
  DeviceSettingsPatchSchema,
  DeviceSettingsSchema,
  monthsBefore,
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

  it.each([
    ['6m', '2026-08-31T10:00:00.000Z', '2026-02-28T10:00:00.000Z'],
    ['3m', '2026-05-31T23:59:59.000Z', '2026-02-28T23:59:59.000Z'],
    ['6m', '2027-08-31T00:00:00.000Z', '2027-02-28T00:00:00.000Z'],
    ['6m', '2028-08-31T08:00:00.000Z', '2028-02-29T08:00:00.000Z'],
    ['3m', '2026-12-31T08:00:00.000Z', '2026-09-30T08:00:00.000Z'],
    ['1y', '2028-02-29T08:00:00.000Z', '2027-02-28T08:00:00.000Z'],
    ['5y', '2028-02-29T08:00:00.000Z', '2023-02-28T08:00:00.000Z'],
    ['5y', '2032-02-29T08:00:00.000Z', '2027-02-28T08:00:00.000Z'],
    ['3m', '2026-03-15T08:00:00.000Z', '2025-12-15T08:00:00.000Z'],
  ] as const)(
    'clamps a %s cutoff from %s to the last day of the shorter month',
    (window, now, expected) => {
      expect(offlineWindowCutoff(window, new Date(now))?.toISOString()).toBe(expected);
    },
  );

  it('clamps one month before March 31 to the end of February in common and leap years', () => {
    const before = (now: string, months: number) =>
      monthsBefore(new Date(now), months).toISOString();

    expect(before('2026-03-31T08:00:00.000Z', 1)).toBe('2026-02-28T08:00:00.000Z');
    expect(before('2028-03-31T08:00:00.000Z', 1)).toBe('2028-02-29T08:00:00.000Z');
    expect(before('2100-03-31T08:00:00.000Z', 1)).toBe('2100-02-28T08:00:00.000Z');
    expect(before('2000-03-31T08:00:00.000Z', 1)).toBe('2000-02-29T08:00:00.000Z');
    expect(before('2026-01-31T08:00:00.000Z', 1)).toBe('2025-12-31T08:00:00.000Z');
    expect(before('2026-03-31T08:00:00.000Z', 0)).toBe('2026-03-31T08:00:00.000Z');
  });
});
