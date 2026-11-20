import type { MailAccount, UnsupportedSplit } from '@relay/shared';

export const UNSUPPORTED_SPLIT_NOTE =
  'Tento split používa podmienky, ktoré táto verzia nepozná. Aktualizuj Relay.';

export interface UnsupportedSplitRowProps {
  readonly split: UnsupportedSplit;
  readonly accounts: readonly MailAccount[];
}

export function UnsupportedSplitRow({ split, accounts }: UnsupportedSplitRowProps) {
  const account = accounts.find((item) => item.id === split.accountId);
  return (
    <li className="au-row au-unsupported" aria-label={`Split ${split.name}`} aria-readonly="true">
      <span className="au-grip" aria-hidden="true" />
      <span className="au-open">
        <span className="au-name">
          <b>{split.name}</b>
          <span className="scope warn">Len na čítanie</span>
        </span>
        <span className="au-sum">{UNSUPPORTED_SPLIT_NOTE}</span>
      </span>
      <span className="chip au-acc">{account?.displayName ?? 'Všetky účty'}</span>
    </li>
  );
}
