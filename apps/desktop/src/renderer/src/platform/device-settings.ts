import {
  type DeviceSettings,
  type DeviceSettingsPatch,
  DeviceSettingsSchema,
  DEFAULT_DEVICE_SETTINGS,
} from '@relay/shared';

export const mergeDeviceSettings = (
  current: DeviceSettings,
  patch: DeviceSettingsPatch,
): DeviceSettings => {
  const merged = {
    ...current,
    ...patch,
    panelWidths: { ...current.panelWidths, ...patch.panelWidths },
  };
  const parsed = DeviceSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : current;
};

export const parseStoredDeviceSettings = (raw: string | null): DeviceSettings => {
  if (raw === null) {
    return DEFAULT_DEVICE_SETTINGS;
  }
  try {
    const parsed = DeviceSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_DEVICE_SETTINGS;
  } catch {
    return DEFAULT_DEVICE_SETTINGS;
  }
};
