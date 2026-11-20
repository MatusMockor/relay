import { DEFAULT_OFFLINE_WINDOW, type DeviceSettings, type OfflineWindow } from '@relay/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '../../../data/hooks/services-context';
import { showToast } from '../../../state/toast-store';

const DEVICE_SETTINGS_KEY = ['device-settings'] as const;

export const useOfflineWindow = (): readonly [OfflineWindow, (next: OfflineWindow) => void] => {
  const { platform } = useAppContext();
  const client = useQueryClient();
  const device = useQuery({
    queryKey: DEVICE_SETTINGS_KEY,
    queryFn: () => platform.deviceSettings(),
  });
  const choose = (next: OfflineWindow) => {
    const previous = client.getQueryData<DeviceSettings>(DEVICE_SETTINGS_KEY);
    if (previous !== undefined) {
      client.setQueryData<DeviceSettings>(DEVICE_SETTINGS_KEY, {
        ...previous,
        offlineWindow: next,
      });
    }
    platform
      .updateDeviceSettings({ offlineWindow: next })
      .then((saved) => {
        client.setQueryData(DEVICE_SETTINGS_KEY, saved);
      })
      .catch(() => {
        client.setQueryData(DEVICE_SETTINGS_KEY, previous);
        showToast('Nastavenie offline pošty sa nepodarilo uložiť');
      });
  };
  return [device.data?.offlineWindow ?? DEFAULT_OFFLINE_WINDOW, choose];
};
