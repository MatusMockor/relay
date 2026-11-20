import type { MailAccount, UnsupportedAutomation } from '@relay/shared';
import { cx } from '@relay/ui';

export interface UnsupportedRuleRowProps {
  readonly rule: UnsupportedAutomation;
  readonly accounts: readonly MailAccount[];
}

export const UNSUPPORTED_RULE_NOTE = 'Pravidlo z novšej verzie Relay, aktualizuj aplikáciu';

export function UnsupportedRuleRow({ rule, accounts }: UnsupportedRuleRowProps) {
  const account = accounts.find((item) => item.id === rule.accountId);
  return (
    <li
      className={cx('au-row', 'au-unsupported', !rule.enabled && 'off')}
      aria-label={`Pravidlo ${rule.name}`}
      aria-readonly="true"
    >
      <span className="au-grip" aria-hidden="true" />
      <span className="au-open">
        <span className="au-name">
          <b>{rule.name}</b>
          <span className="scope warn">Len na čítanie</span>
        </span>
        <span className="au-sum">{UNSUPPORTED_RULE_NOTE}</span>
      </span>
      <span className="chip au-acc">{account?.displayName ?? 'Všetky účty'}</span>
    </li>
  );
}
