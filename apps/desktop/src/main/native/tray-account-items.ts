import type { AccountScope } from '@relay/shared/ipc';
import { knownUnreadTotal, type TrayAccount } from './tray-accounts';
import { unreadLabel } from './tray-labels';
import type { TrayMenuItem } from './tray-menu-items';

const effectiveScope = (accounts: readonly TrayAccount[], scope: AccountScope): AccountScope => {
  const [only] = accounts;
  if (accounts.length === 1 && only !== undefined) {
    return only.id;
  }
  if (accounts.some((account) => account.id === scope)) {
    return scope;
  }
  return 'all';
};

const accountSublabel = (account: TrayAccount): string =>
  account.unread === null ? account.email : `${account.email} - ${String(account.unread)}`;

const accountChoice = (account: TrayAccount, scope: AccountScope): TrayMenuItem => ({
  kind: 'choice',
  label: account.displayName,
  sublabel: accountSublabel(account),
  color: account.color,
  checked: account.id === scope,
  action: { type: 'select-scope', scope: account.id },
});

const allAccountsChoice = (
  accounts: readonly TrayAccount[],
  scope: AccountScope,
): TrayMenuItem[] => {
  if (accounts.length < 2) {
    return [];
  }
  const total = knownUnreadTotal(accounts);
  return [
    {
      kind: 'choice',
      label: 'Všetky účty',
      sublabel: total === null ? null : unreadLabel(total),
      color: null,
      checked: scope === 'all',
      action: { type: 'select-scope', scope: 'all' },
    },
  ];
};

export const trayAccountItems = (
  accounts: readonly TrayAccount[],
  scope: AccountScope,
): TrayMenuItem[] => {
  if (accounts.length === 0) {
    return [];
  }
  const checked = effectiveScope(accounts, scope);
  return [
    { kind: 'separator' },
    { kind: 'header', label: 'Otvoriť s účtom' },
    ...accounts.map((account) => accountChoice(account, checked)),
    ...allAccountsChoice(accounts, checked),
  ];
};
