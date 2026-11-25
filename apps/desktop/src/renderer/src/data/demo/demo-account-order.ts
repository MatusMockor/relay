import type { AccountId, MailAccount, RealtimeEvent } from '@relay/shared';
import { MailClientError } from '../errors';
import type { AccountManager } from '../MailClient';
import type { DemoState } from './demo-state';

type DemoAccountOrderMethods = Pick<AccountManager, 'reorderAccounts'>;

const isCompleteOrder = (
  accounts: readonly MailAccount[],
  accountIds: readonly AccountId[],
): boolean => {
  const listed = new Set<string>(accountIds);
  return (
    listed.size === accountIds.length &&
    listed.size === accounts.length &&
    accounts.every((account) => listed.has(account.id))
  );
};

export const createDemoAccountOrder = (
  state: DemoState,
  now: () => Date,
  emit: (event: RealtimeEvent) => void,
): DemoAccountOrderMethods => ({
  reorderAccounts: (accountIds) => {
    if (!isCompleteOrder(state.accounts, accountIds)) {
      return Promise.reject(
        new MailClientError({
          code: 'validation_failed',
          message: 'Poradie musí obsahovať každý účet práve raz',
        }),
      );
    }
    const byId = new Map(state.accounts.map((account) => [account.id as string, account]));
    state.accounts = accountIds.flatMap((id) => byId.get(id) ?? []);
    emit({
      type: 'accounts.reordered',
      at: now().toISOString(),
      data: { accountIds: state.accounts.map((account) => account.id) },
    });
    return Promise.resolve([...state.accounts]);
  },
});
