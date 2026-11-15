import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { DeviceSettingsStore } from '../settings/device-settings-store';

export const createDeviceSettingsHandlers = (store: DeviceSettingsStore): IpcInvokeHandlers => ({
  'settings.device.get': () => store.get(),
  'settings.device.set': (patch) => store.update(patch),
});
