import type { AccountId, MailAccount } from '@relay/shared';
import { useMemo } from 'react';
import { useAccounts } from '../../data/hooks/use-mail-queries';
import { useUiStore } from '../../state/ui-store';
import { accountHue } from '../colors/name-colors';

export interface AccountsModel {
  readonly accounts: readonly MailAccount[];
  readonly byId: ReadonlyMap<string, MailAccount>;
  readonly multi: boolean;
  readonly unified: boolean;
  readonly current: MailAccount | null;
  readonly primary: MailAccount | null;
  readonly accountName: (id: AccountId | string) => string;
}

export const accountLike = (account: MailAccount) => ({
  name: account.displayName,
  color: accountHue(account.color),
});

export const useAccountsModel = (): AccountsModel => {
  const { data } = useAccounts();
  const scope = useUiStore((state) => state.scope);
  return useMemo(() => {
    const accounts = data ?? [];
    const byId = new Map(accounts.map((account) => [account.id as string, account]));
    const current = scope === 'all' ? null : (byId.get(scope) ?? null);
    return {
      accounts,
      byId,
      multi: accounts.length > 1,
      unified: scope === 'all' && accounts.length > 1,
      current,
      primary: accounts.find((account) => account.isPrimary) ?? accounts[0] ?? null,
      accountName: (id) => byId.get(id)?.displayName ?? '',
    };
  }, [data, scope]);
};
