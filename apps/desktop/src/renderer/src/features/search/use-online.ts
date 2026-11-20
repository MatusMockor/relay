import { useSyncExternalStore } from 'react';

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

const snapshot = (): boolean => window.navigator.onLine;

export const useOnline = (): boolean => useSyncExternalStore(subscribe, snapshot, () => true);
