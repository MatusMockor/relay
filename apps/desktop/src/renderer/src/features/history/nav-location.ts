import type { ThreadId } from '@relay/shared';
import { type AccountScope, type Folder, folderKey } from '../../state/folders';
import type { AutomationView, OverlayState, SettingsSection, UiState } from '../../state/ui-store';

export interface SettingsLocation {
  readonly section: SettingsSection;
  readonly adding: boolean;
  readonly automation: AutomationView;
}

export interface NavLocation {
  readonly scope: AccountScope;
  readonly folder: Folder;
  readonly openThreadId: ThreadId | null;
  readonly searchOpen: boolean;
  readonly settings: SettingsLocation | null;
}

export const AUTOMATION_LIST: AutomationView = { kind: 'list' };

const settingsOf = (overlay: OverlayState | null): SettingsLocation | null => {
  if (overlay?.kind !== 'settings') {
    return null;
  }
  return {
    section: overlay.section,
    adding: overlay.adding,
    automation:
      overlay.section === 'automations' ? (overlay.automation ?? AUTOMATION_LIST) : AUTOMATION_LIST,
  };
};

export const isTransientOverlay = (overlay: OverlayState | null): boolean =>
  overlay !== null && overlay.kind !== 'settings';

export const locationOf = (state: UiState): NavLocation | null => {
  if (isTransientOverlay(state.overlay)) {
    return null;
  }
  return {
    scope: state.scope,
    folder: state.folder,
    openThreadId: state.openThreadId,
    searchOpen: state.searchOpen,
    settings: settingsOf(state.overlay),
  };
};

const automationKey = (view: AutomationView): string =>
  view.kind === 'detail' ? `detail:${view.key}` : view.kind;

const locationKey = (location: NavLocation): string =>
  JSON.stringify([
    location.scope,
    folderKey(location.folder),
    location.openThreadId,
    location.searchOpen,
    location.settings === null
      ? null
      : [
          location.settings.section,
          location.settings.adding,
          automationKey(location.settings.automation),
        ],
  ]);

export const sameLocation = (a: NavLocation, b: NavLocation): boolean =>
  locationKey(a) === locationKey(b);
