import type { ThemePreference } from '@relay/shared';
import { useAppContext } from '../../../data/hooks/services-context';
import { showToast } from '../../../state/toast-store';
import { useThemeController, useThemePreference } from '../../../theme/theme-context';

export const useThemeChoice = (): readonly [ThemePreference, (next: ThemePreference) => void] => {
  const { platform } = useAppContext();
  const controller = useThemeController();
  const preference = useThemePreference();
  const choose = (next: ThemePreference) => {
    controller.choose(next);
    platform.updateDeviceSettings({ theme: next }).catch(() => {
      showToast('Tému sa nepodarilo uložiť, platí len do reštartu');
    });
  };
  return [preference, choose];
};
