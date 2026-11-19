import { type HistoryEntry, HistoryRecorder } from './history-recorder';
import type { NavLocation } from './nav-location';
import { NavigationHistory } from './navigation-history';
import { uiLocationStore } from './ui-location-store';

export const appHistory = new HistoryRecorder<NavLocation>(
  new NavigationHistory<HistoryEntry<NavLocation>>(),
  uiLocationStore,
);
