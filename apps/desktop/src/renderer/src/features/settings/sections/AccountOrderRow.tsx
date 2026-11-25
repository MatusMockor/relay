import type { MailAccount } from '@relay/shared';
import { AccountSquare, cx, Kbd } from '@relay/ui';
import { useEffect, useRef } from 'react';
import { accountShortcutKeys } from '../../folders/account-shortcut';
import { accountLike } from '../../mail/use-accounts-model';
import type { DragHandleProps, DropTargetProps } from '../automations/use-row-drag';

export interface AccountOrderRowProps {
  readonly account: MailAccount;
  readonly index: number;
  readonly place: 'above' | 'below' | null;
  readonly focusHandle: boolean;
  readonly canFocus: () => boolean;
  readonly onFocused: () => void;
  readonly handle: DragHandleProps;
  readonly target: DropTargetProps;
}

export function AccountOrderRow({
  account,
  index,
  place,
  focusHandle,
  canFocus,
  onFocused,
  handle,
  target,
}: AccountOrderRowProps) {
  const grip = useRef<HTMLButtonElement>(null);
  const keys = accountShortcutKeys(false, index);
  useEffect(() => {
    if (!focusHandle) {
      return;
    }
    if (canFocus()) {
      grip.current?.focus();
    }
    onFocused();
  }, [focusHandle, canFocus, onFocused]);
  return (
    <li
      className={cx('au-row', 'ao-row', place !== null && `drop-${place}`)}
      aria-label={`Účet ${account.displayName}`}
      {...target}
    >
      <button
        ref={grip}
        type="button"
        className="au-grip"
        aria-label={`Presunúť účet ${account.displayName}`}
        title="Potiahni alebo použi Alt a šípky"
        {...handle}
      />
      <AccountSquare account={accountLike(account)} small />
      <span className="ao-main">
        <b>{account.displayName}</b>
        <span>{account.email}</span>
      </span>
      {account.isPrimary ? <span className="chip pri">Hlavný</span> : null}
      {keys.length === 0 ? null : (
        <span className="ao-keys">
          <Kbd keys={keys} />
        </span>
      )}
    </li>
  );
}
