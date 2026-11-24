import { type AutomationView, setUi, type UiState, useUiStore } from '../../../state/ui-store';
import { appHistory } from '../../history/app-history';
import { AUTOMATION_LIST, type NavLocation } from '../../history/nav-location';

const viewOf = (state: UiState): AutomationView =>
  state.overlay?.kind === 'settings'
    ? (state.overlay.automation ?? AUTOMATION_LIST)
    : AUTOMATION_LIST;

export const useAutomationView = (): AutomationView => useUiStore(viewOf);

export const showAutomationView = (view: AutomationView): void => {
  setUi((state) =>
    state.overlay?.kind === 'settings' ? { overlay: { ...state.overlay, automation: view } } : {},
  );
};

const renamedDetail =
  (from: string, to: string) =>
  (location: NavLocation): NavLocation => {
    const { settings } = location;
    if (settings?.automation.kind !== 'detail' || settings.automation.key !== from) {
      return location;
    }
    return { ...location, settings: { ...settings, automation: { kind: 'detail', key: to } } };
  };

export const renameAutomationDetail = (from: string, to: string): void => {
  appHistory.rewrite(renamedDetail(from, to));
};
