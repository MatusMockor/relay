import type { AiRunnerKind, Automation, MailAccount } from '@relay/shared';
import { useState } from 'react';
import { choiceConditions, choiceName } from './mail-rule-choice';
import { mailRuleInput } from './mail-rule-input';
import type { MailRuleOption } from './mail-rule-options';
import { MailRuleActions } from './MailRuleActions';
import { MailRuleOptionList } from './MailRuleOptionList';
import { SplitFiling } from './SplitFiling';
import { useCreateMailRule } from './use-create-mail-rule';
import { useMailRuleDraft } from './use-mail-rule-draft';

export interface RuleFromMailFormProps {
  readonly account: MailAccount;
  readonly accounts: readonly MailAccount[];
  readonly options: readonly MailRuleOption[];
  readonly existing: readonly Automation[];
  readonly runner: AiRunnerKind;
  readonly onClose: () => void;
}

export function RuleFromMailForm({
  account,
  accounts,
  options,
  existing,
  runner,
  onClose,
}: RuleFromMailFormProps) {
  const draft = useMailRuleDraft(options);
  const [filing, setFiling] = useState(false);
  const creating = useCreateMailRule(existing);
  const input = mailRuleInput({
    accountId: account.id,
    name: choiceName(options, draft.selected),
    conditions: choiceConditions(options, draft.selected),
    actions: draft.actions,
    runner,
    order: existing.length,
  });
  return (
    <>
      <p className="rfm-lead">Vyber, čím sa majú podobné maily rozpoznať.</p>
      <MailRuleOptionList
        options={options}
        selected={draft.selected}
        disabled={creating.busy}
        onToggle={draft.toggleOption}
      />
      {filing ? (
        <SplitFiling
          accountId={account.id}
          conditions={input.conditions}
          suggestedName={input.name}
          onCancel={() => {
            setFiling(false);
          }}
          onFiled={onClose}
        />
      ) : (
        <MailRuleActions
          account={account}
          accounts={accounts}
          input={input}
          draft={draft}
          creating={creating}
          onFile={() => {
            setFiling(true);
          }}
          onClose={onClose}
        />
      )}
    </>
  );
}
