import type { MailAccount } from '@relay/shared';
import { useEffect } from 'react';
import { useAccounts } from '../../data/hooks/use-mail-queries';
import type { AccountScope } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { selectScope } from '../mail/navigation';

const isKnownScope = (scope: AccountScope, accounts: readonly MailAccount[]): boolean =>
  scope === 'all' || accounts.some((account) => account.id === scope);

export const useScopeValidation = (): void => {
  const { data } = useAccounts();
  useEffect(() => {
    if (data === undefined || isKnownScope(useUiStore.getState().scope, data)) {
      return;
    }
    selectScope('all');
  }, [data]);
};
