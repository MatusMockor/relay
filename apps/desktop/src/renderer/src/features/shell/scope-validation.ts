import type { MailAccount } from '@relay/shared';
import { useEffect } from 'react';
import { useAccounts } from '../../data/hooks/use-mail-queries';
import type { AccountScope } from '../../state/folders';
import { setUi, useUiStore } from '../../state/ui-store';
import { selectScope } from '../mail/navigation';

const isKnownScope = (scope: AccountScope, accounts: readonly MailAccount[]): boolean =>
  scope === 'all' || accounts.some((account) => account.id === scope);

const resetUnknownComposeScope = (accounts: readonly MailAccount[]): void => {
  const { overlay } = useUiStore.getState();
  if (overlay?.kind !== 'compose' || isKnownScope(overlay.scope, accounts)) {
    return;
  }
  setUi({ overlay: { ...overlay, scope: 'all' } });
};

export const useScopeValidation = (): void => {
  const { data } = useAccounts();
  const scope = useUiStore((state) => state.scope);
  useEffect(() => {
    if (data === undefined) {
      return;
    }
    resetUnknownComposeScope(data);
    if (isKnownScope(scope, data)) {
      return;
    }
    selectScope('all');
  }, [data, scope]);
};
