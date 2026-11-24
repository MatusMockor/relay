import { useEffect } from 'react';
import { type SettingsSection, useUiStore } from '../../state/ui-store';
import { settingsTabId } from './SettingsNav';

export const useSettingsFocus = (section: SettingsSection): void => {
  const overlay = useUiStore((state) => state.overlay);
  useEffect(() => {
    const tab = document.getElementById(settingsTabId(section));
    const sheet = tab?.closest('[aria-modal="true"]') ?? null;
    if (tab === null || sheet === null || sheet.contains(document.activeElement)) {
      return;
    }
    tab.focus();
  }, [section, overlay]);
};
