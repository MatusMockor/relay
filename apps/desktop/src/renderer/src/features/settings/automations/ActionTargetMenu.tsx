import type { AccountId, AutomationAction, LabelId, MailAccount } from '@relay/shared';
import { useState } from 'react';
import { isGmailAccount } from './action-targets';
import { LabelActionPicker } from './LabelActionPicker';
import { MailboxActionPicker } from './MailboxActionPicker';
import { OptionList } from './OptionList';

export type TargetKind = 'moveTo' | 'addLabel';

export interface ActionTargetMenuProps {
  readonly kind: TargetKind;
  readonly actions: readonly AutomationAction[];
  readonly current: AutomationAction | null;
  readonly accountId: AccountId | null;
  readonly accounts: readonly MailAccount[];
  readonly onPick: (action: AutomationAction, accountId: AccountId) => void;
}

export function ActionTargetMenu({
  kind,
  actions,
  current,
  accountId,
  accounts,
  onPick,
}: ActionTargetMenuProps) {
  const [picked, setPicked] = useState<AccountId | null>(accountId);
  if (picked === null) {
    return (
      <OptionList
        title="Najprv vyber účet pravidla"
        options={accounts.map((account) => ({
          key: account.id,
          label: account.displayName,
          pick: () => {
            setPicked(account.id);
          },
        }))}
      />
    );
  }
  if (kind === 'moveTo') {
    return (
      <MailboxActionPicker
        accountId={picked}
        gmail={isGmailAccount(
          accounts.find((account) => account.id === picked),
          [],
        )}
        current={current?.type === 'moveTo' ? current.mailboxId : null}
        onPick={(mailboxId) => {
          onPick({ type: 'moveTo', mailboxId }, picked);
        }}
      />
    );
  }
  const taken = actions.flatMap((action): LabelId[] =>
    action.type === 'addLabel' ? [action.labelId] : [],
  );
  return (
    <LabelActionPicker
      accountId={picked}
      taken={taken}
      current={current?.type === 'addLabel' ? current.labelId : null}
      onPick={(labelId) => {
        onPick({ type: 'addLabel', labelId }, picked);
      }}
    />
  );
}
