import { useEffect } from 'react';
import { setUi, useUiStore } from '../../state/ui-store';
import { appHistory } from '../history/app-history';
import { readStoredScope, writeStoredScope } from './stored-scope';

export const useScopePersistence = (): void => {
  useEffect(() => {
    const stored = readStoredScope();
    if (stored !== null) {
      appHistory.quietly(() => {
        setUi({ scope: stored });
      });
    }
    return useUiStore.subscribe((state, previous) => {
      if (state.scope === previous.scope) {
        return;
      }
      writeStoredScope(state.scope);
    });
  }, []);
};
