import type { MailAccount } from '@relay/shared';
import { AccountSquare, type AnchorRect, Icon, Kbd, Popover } from '@relay/ui';
import { useState } from 'react';
import { MOD } from '../../lib/platform-keys';
import { isControlTarget } from '../keyboard/focus-target';
import { accountLike } from '../mail/use-accounts-model';

export interface AccountMenuProps {
  readonly anchor: AnchorRect;
  readonly title: string;
  readonly accounts: readonly MailAccount[];
  readonly current: string;
  readonly withAll: boolean;
  readonly unread?: (id: string) => number;
  readonly onPick: (id: string) => void;
  readonly onAdd?: () => void;
  readonly onClose: () => void;
}

export function AccountMenu({
  anchor,
  title,
  accounts,
  current,
  withAll,
  unread,
  onPick,
  onAdd,
  onClose,
}: AccountMenuProps) {
  const ids = [...(withAll ? ['all'] : []), ...accounts.map((account) => account.id as string)];
  const [cursor, setCursor] = useState(Math.max(0, ids.indexOf(current)));
  const pick = (id: string | undefined) => {
    if (id === undefined) {
      return;
    }
    onClose();
    onPick(id);
  };
  const onKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      setCursor((value) => (value + move + ids.length) % ids.length);
      return true;
    }
    if (event.key === 'Enter' && !isControlTarget(event.target)) {
      event.preventDefault();
      pick(ids[cursor]);
      return true;
    }
    return false;
  };
  return (
    <Popover
      anchor={anchor}
      label={title}
      role="menu"
      className="acm"
      onClose={onClose}
      onKey={onKey}
    >
      <div className="grp">{title}</div>
      {ids.map((id, index) => {
        const account = accounts.find((item) => item.id === id) ?? null;
        const count = unread?.(id) ?? 0;
        return (
          <button
            key={id}
            type="button"
            role="menuitemradio"
            aria-checked={id === current}
            className={`pi${index === cursor ? ' on' : ''}${id === current ? ' cur' : ''}`}
            onMouseMove={() => {
              setCursor(index);
            }}
            onClick={() => {
              pick(id);
            }}
          >
            <span className="ic">
              <AccountSquare
                account={account === null ? null : accountLike(account)}
                all={accounts.map(accountLike)}
                small
              />
            </span>
            <span className="lb">
              {account === null ? 'Všetky účty' : account.displayName}
              <small>
                {account === null ? `${String(accounts.length)} účty spolu` : account.email}
              </small>
            </span>
            {id === current ? (
              <span className="ck">
                <Icon name="check" />
              </span>
            ) : null}
            {count > 0 ? <span className="wh">{count}</span> : null}
            {withAll && index < 9 ? <Kbd keys={[`${MOD}${String(index + 1)}`]} /> : null}
          </button>
        );
      })}
      {onAdd === undefined ? null : (
        <>
          <div className="sepl" />
          <button
            type="button"
            className="pi"
            role="menuitem"
            onClick={() => {
              onClose();
              onAdd();
            }}
          >
            <span className="ic">
              <Icon name="plus" />
            </span>
            <span className="lb">Pridať účet…</span>
          </button>
        </>
      )}
    </Popover>
  );
}
