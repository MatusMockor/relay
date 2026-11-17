import type { AccountId } from '@relay/shared';
import { AccountDot, Avatar } from '@relay/ui';
import type { ReactNode } from 'react';
import { accountLike, useAccountsModel } from '../mail/use-accounts-model';

export interface ContactHeaderProps {
  readonly name: string;
  readonly seed: string;
  readonly subtitle: string;
  readonly accountId: AccountId;
  readonly tag?: string;
  readonly children?: ReactNode;
}

export function ContactHeader({
  name,
  seed,
  subtitle,
  accountId,
  tag,
  children,
}: ContactHeaderProps) {
  const model = useAccountsModel();
  const account = model.multi ? model.byId.get(accountId) : undefined;
  return (
    <div className="a-prof">
      <Avatar name={name} seed={seed} size="lg" />
      <div className="a-name">
        <h3>{name}</h3>
        {tag === undefined ? null : <span className="a-tag">{tag}</span>}
      </div>
      <p>{subtitle}</p>
      {account === undefined ? null : (
        <p className="a-acct">
          <AccountDot account={accountLike(account)} /> {account.displayName}
        </p>
      )}
      {children}
    </div>
  );
}
