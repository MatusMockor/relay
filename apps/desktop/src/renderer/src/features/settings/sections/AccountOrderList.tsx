import type { MailAccount } from '@relay/shared';
import { useRef, useState } from 'react';
import { useReorderAccounts } from '../../../data/hooks/use-reorder-accounts';
import { MOD } from '../../../lib/platform-keys';
import { canMove, moveRule } from '../automations/rule-order';
import { useRowDrag } from '../automations/use-row-drag';
import { SettingsGroup } from '../SettingsGroup';
import { AccountOrderRow } from './AccountOrderRow';
import { focusStayedIn, handleFocusedIn } from './focus-after-move';

interface FocusRequest {
  readonly key: string;
  readonly index: number;
}

export function AccountOrderList({ accounts }: { readonly accounts: readonly MailAccount[] }) {
  const reorder = useReorderAccounts();
  const list = useRef<HTMLUListElement>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const drag = useRowDrag({
    keys: accounts.map((account) => account.id),
    disabled: false,
    onMove: (from, to) => {
      if (!canMove(accounts.length, from, to)) {
        return;
      }
      const key = accounts[from]?.id;
      const request =
        handleFocusedIn(list.current) && key !== undefined ? { key, index: to } : null;
      setFocusRequest(request);
      reorder.mutate(moveRule(accounts, from, to), {
        onSettled: () => {
          setFocusRequest((current) => (current === request ? null : current));
        },
      });
    },
  });
  const focusDone = () => {
    setFocusRequest(null);
  };
  if (accounts.length < 2) {
    return null;
  }
  return (
    <>
      <SettingsGroup title="Poradie účtov" />
      <p className="sh-note ao-note">
        {`Presuň účty do poradia, v akom ich chceš mať v bočnom paneli. Skratky ${MOD}1 až ${MOD}9 idú podľa tohto poradia.`}
      </p>
      <ul ref={list} className="au-list ao-list" role="list" aria-label="Poradie účtov">
        {accounts.map((account, index) => (
          <AccountOrderRow
            key={account.id}
            account={account}
            index={index}
            place={drag.place(index)}
            focusHandle={focusRequest?.key === account.id && focusRequest.index === index}
            canFocus={() => focusStayedIn(list.current)}
            onFocused={focusDone}
            handle={drag.handle(index)}
            target={drag.target(index)}
          />
        ))}
      </ul>
    </>
  );
}
