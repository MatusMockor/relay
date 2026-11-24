import { folderKey } from '../../state/folders';
import { type OverlayState, setUi, type UiState } from '../../state/ui-store';
import { isTransientOverlay, type NavLocation, type SettingsLocation } from './nav-location';

const overlayOf = (state: UiState, settings: SettingsLocation | null): OverlayState | null => {
  if (isTransientOverlay(state.overlay)) {
    return state.overlay;
  }
  return settings === null ? null : { kind: 'settings', ...settings };
};

const selectedFor = (state: UiState, location: NavLocation): UiState['selected'] =>
  location.openThreadId === null
    ? state.selected
    : { ...state.selected, [folderKey(location.folder)]: location.openThreadId };

export const applyLocation = (location: NavLocation): void => {
  setUi((state) => ({
    scope: location.scope,
    folder: location.folder,
    openThreadId: location.openThreadId,
    searchOpen: location.searchOpen,
    query: location.searchOpen ? state.query : '',
    searchFilters: location.searchOpen ? state.searchFilters : null,
    reply: state.reply?.threadId === location.openThreadId ? state.reply : null,
    selected: selectedFor(state, location),
    overlay: overlayOf(state, location.settings),
  }));
};
