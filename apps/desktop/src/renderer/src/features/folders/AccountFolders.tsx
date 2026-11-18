import type { Label } from '@relay/shared';
import { useAccountsMailboxes } from '../../data/hooks/use-mail-queries';
import { useUiStore } from '../../state/ui-store';
import { useAccountsModel } from '../mail/use-accounts-model';
import { AccountFolderGroup } from './AccountFolderGroup';

export function AccountFolders({ labels }: { readonly labels: readonly Label[] }) {
  const model = useAccountsModel();
  const scope = useUiStore((state) => state.scope);
  const accounts = model.accounts.filter((account) => scope === 'all' || account.id === scope);
  const mailboxes = useAccountsMailboxes(accounts.map((account) => account.id));
  const grouped = scope === 'all' && accounts.length > 1;
  return (
    <>
      {grouped ? <h5>Priečinky a štítky</h5> : null}
      {accounts.map((account, index) => (
        <AccountFolderGroup
          key={account.id}
          account={account}
          grouped={grouped}
          mailboxes={mailboxes[index]?.data ?? []}
          labels={labels.filter((label) => label.accountId === account.id)}
        />
      ))}
    </>
  );
}
