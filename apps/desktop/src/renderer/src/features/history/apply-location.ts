import { folderKey } from '../../state/folders';
import { type OverlayState, setUi, type UiState } from '../../state/ui-store';
import type { NavLocation, SettingsLocation } from './nav-location';

const overlayOf = (settings: SettingsLocation | null): OverlayState | null =>
  settings === null ? null : { kind: 'settings', ...settings };

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
    reply: state.reply?.threadId === location.openThreadId ? state.reply : null,
    selected: selectedFor(state, location),
    overlay: overlayOf(location.settings),
  }));
};
