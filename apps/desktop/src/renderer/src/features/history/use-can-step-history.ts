import { subscribeToLayers } from '@relay/ui';
import { useCallback, useSyncExternalStore } from 'react';
import { useUiStore } from '../../state/ui-store';
import { appHistory } from './app-history';
import type { HistoryDirection } from './navigation-history';
import { canStepHistory } from './step-history';

const subscribe = (listener: () => void): (() => void) => {
  const stops = [
    appHistory.subscribe(listener),
    useUiStore.subscribe(listener),
    subscribeToLayers(listener),
  ];
  return () => {
    stops.forEach((stop) => {
      stop();
    });
  };
};

export const useCanStepHistory = (direction: HistoryDirection): boolean => {
  const snapshot = useCallback(() => canStepHistory(direction), [direction]);
  return useSyncExternalStore(subscribe, snapshot);
};
