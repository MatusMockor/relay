import type { AccountId, AutomationAction, LabelId, MailAccount } from '@relay/shared';
import { useState } from 'react';
import { choicesFor } from './action-choices';
import { isGmailAccount, moveChoiceLabel } from './action-targets';
import { ACTION_LABELS } from './automation-labels';
import { LabelActionPicker } from './LabelActionPicker';
import { MailboxActionPicker } from './MailboxActionPicker';
import { OptionList } from './OptionList';

type TargetKind = 'moveTo' | 'addLabel';
type Step =
  | { readonly kind: 'menu' }
  | { readonly kind: 'account'; readonly next: TargetKind }
  | { readonly kind: TargetKind; readonly accountId: AccountId };

export interface ActionMenuProps {
  readonly title: string;
  readonly actions: readonly AutomationAction[];
  readonly current: AutomationAction | null;
  readonly accountId: AccountId | null;
  readonly accounts: readonly MailAccount[];
  readonly onPick: (action: AutomationAction, accountId: AccountId | null) => void;
}

export function ActionMenu({
  title,
  actions,
  current,
  accountId,
  accounts,
  onPick,
}: ActionMenuProps) {
  const [step, setStep] = useState<Step>({ kind: 'menu' });
  const open = (next: TargetKind) => {
    setStep(accountId === null ? { kind: 'account', next } : { kind: next, accountId });
  };
  if (step.kind === 'account') {
    return (
      <OptionList
        title="Najprv vyber účet pravidla"
        options={accounts.map((account) => ({
          key: account.id,
          label: account.displayName,
          pick: () => {
            setStep({ kind: step.next, accountId: account.id });
          },
        }))}
      />
    );
  }
  if (step.kind === 'moveTo') {
    return (
      <MailboxActionPicker
        accountId={step.accountId}
        gmail={isGmailAccount(
          accounts.find((account) => account.id === step.accountId),
          [],
        )}
        current={current?.type === 'moveTo' ? current.mailboxId : null}
        onPick={(mailboxId) => {
          onPick({ type: 'moveTo', mailboxId }, step.accountId);
        }}
      />
    );
  }
  if (step.kind === 'addLabel') {
    const taken = actions.flatMap((action): LabelId[] =>
      action.type === 'addLabel' ? [action.labelId] : [],
    );
    return (
      <LabelActionPicker
        accountId={step.accountId}
        taken={taken}
        current={current?.type === 'addLabel' ? current.labelId : null}
        onPick={(labelId) => {
          onPick({ type: 'addLabel', labelId }, step.accountId);
        }}
      />
    );
  }
  const choices = choicesFor(actions, current);
  const gmail = isGmailAccount(
    accounts.find((account) => account.id === accountId),
    [],
  );
  return (
    <OptionList
      title={title}
      options={[
        ...choices.simple.map((type) => ({
          key: type,
          label: ACTION_LABELS[type],
          pick: () => {
            onPick({ type }, accountId);
          },
        })),
        ...(choices.move
          ? [
              {
                key: 'moveTo',
                label: `${moveChoiceLabel(gmail)}…`,
                pick: () => {
                  open('moveTo');
                },
              },
            ]
          : []),
        {
          key: 'addLabel',
          label: 'Pridať štítok…',
          pick: () => {
            open('addLabel');
          },
        },
      ]}
    />
  );
}
