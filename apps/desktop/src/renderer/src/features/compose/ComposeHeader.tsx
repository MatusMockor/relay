import type { MailAccount } from '@relay/shared';
import { AccountSquare, Icon, IconButton } from '@relay/ui';
import { accountLike } from '../mail/use-accounts-model';

export interface ComposeHeaderProps {
  readonly title: string;
  readonly account: MailAccount | undefined;
  readonly onClose: () => void;
  readonly onPickAccount: (button: HTMLElement) => void;
}

export function ComposeHeader({ title, account, onClose, onPickAccount }: ComposeHeaderProps) {
  return (
    <>
      <div className="nm-h">
        <b>{title}</b>
        <span className="sp" />
        <span className="mono">Esc uloží do Konceptov</span>
        <IconButton label="Zavrieť a uložiť" onClick={onClose}>
          <Icon name="x" />
        </IconButton>
      </div>
      <div className="nm-f">
        <span className="lb">Od</span>
        {account === undefined ? null : (
          <button
            type="button"
            id="nm-from"
            className="from-btn"
            aria-haspopup="menu"
            aria-label={`Od: ${account.displayName}, ${account.email}. Zmeniť účet`}
            onClick={(event) => {
              onPickAccount(event.currentTarget);
            }}
          >
            <AccountSquare account={accountLike(account)} small />
            <span>{account.displayName}</span>
            <small>{account.email}</small>
            <Icon name="down" />
          </button>
        )}
      </div>
    </>
  );
}
