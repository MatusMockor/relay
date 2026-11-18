import { AccountSquare } from '@relay/ui';
import { accountCount } from '../../lib/text';
import { accountShortcutKeys } from '../folders/account-shortcut';
import { selectScope } from '../mail/navigation';
import { accountLike, type AccountsModel } from '../mail/use-accounts-model';
import type { Command } from './use-commands';

export const scopeCommands = (model: AccountsModel): Command[] => {
  if (!model.multi) {
    return [];
  }
  return [...model.accounts, null].map((account, index) => ({
    id: `scope-${account?.id ?? 'all'}`,
    label: `Účet: ${account?.displayName ?? 'Všetky účty'}`,
    sub: account?.email ?? accountCount(model.accounts.length),
    keys: accountShortcutKeys(account === null, index),
    icon: (
      <AccountSquare
        account={account === null ? null : accountLike(account)}
        all={model.accounts.map(accountLike)}
        small
      />
    ),
    alias: `ucet ucty account prepnut ${account?.email ?? 'vsetky'}`,
    run: () => {
      selectScope(account?.id ?? 'all');
    },
  }));
};
