import type { MailAccount } from '@relay/shared';
import { useEffect } from 'react';
import { useAccounts } from '../../data/hooks/use-mail-queries';
import type { AccountScope } from '../../state/folders';
import { setUi, useUiStore } from '../../state/ui-store';
import { selectScope } from '../mail/navigation';
import { readStoredScope, writeStoredScope } from './stored-scope';

const isKnownScope = (scope: AccountScope, accounts: readonly MailAccount[]): boolean =>
  scope === 'all' || accounts.some((account) => account.id === scope);

export const useScopePersistence = (): void => {
  const { data } = useAccounts();
  useEffect(() => {
    const stored = readStoredScope();
    if (stored !== null) {
      setUi({ scope: stored });
    }
    return useUiStore.subscribe((state, previous) => {
      if (state.scope === previous.scope) {
        return;
      }
      writeStoredScope(state.scope);
    });
  }, []);
  useEffect(() => {
    if (data === undefined || isKnownScope(useUiStore.getState().scope, data)) {
      return;
    }
    selectScope('all');
  }, [data]);
};
