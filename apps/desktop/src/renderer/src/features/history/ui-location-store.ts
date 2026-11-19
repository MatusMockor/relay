import { useUiStore } from '../../state/ui-store';
import { applyLocation } from './apply-location';
import type { LocationStore } from './history-recorder';
import { isTransientOverlay, locationOf, type NavLocation, sameLocation } from './nav-location';

export const uiLocationStore: LocationStore<NavLocation> = {
  read: () => locationOf(useUiStore.getState()),
  write: applyLocation,
  same: sameLocation,
  paused: () => isTransientOverlay(useUiStore.getState().overlay),
  subscribe: (listener) => useUiStore.subscribe(listener),
};
