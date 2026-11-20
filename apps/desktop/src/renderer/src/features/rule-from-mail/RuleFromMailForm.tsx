import {
  type AiRunnerKind,
  type Automation,
  MAIL_AUTOMATION_ACTION_TYPES,
  type MailAccount,
} from '@relay/shared';
import { Button } from '@relay/ui';
import { openSeededRule } from '../settings/automations/seeded-rule';
import { describeRule } from '../settings/automations/rule-summary';
import { useActionTargets } from '../settings/automations/use-action-targets';
import { choiceConditions, choiceName } from './mail-rule-choice';
import { isCreatable, mailRuleInput } from './mail-rule-input';
import type { MailRuleOption } from './mail-rule-options';
import { MailRuleOptionList } from './MailRuleOptionList';
import { MailRulePreview } from './MailRulePreview';
import { QuickActionChips } from './QuickActionChips';
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
  const accountId = account.id;
  const draft = useMailRuleDraft(options);
  const targets = useActionTargets(accountId, accounts);
  const creating = useCreateMailRule(existing);
  const input = mailRuleInput({
    accountId,
    name: choiceName(options, draft.selected),
    conditions: choiceConditions(options, draft.selected),
    actions: draft.actions,
    runner,
    order: existing.length,
  });
  const ready = isCreatable(input) && !creating.busy;
  const mailActions = input.actions.some((action) =>
    MAIL_AUTOMATION_ACTION_TYPES.includes(action.type),
  );
  return (
    <>
      <p className="rfm-lead">Vyber, čím sa majú podobné maily rozpoznať.</p>
      <MailRuleOptionList
        options={options}
        selected={draft.selected}
        disabled={creating.busy}
        onToggle={draft.toggleOption}
      />
      <h4 className="rfm-sec">Potom</h4>
      <QuickActionChips
        actions={draft.actions}
        accountId={accountId}
        accounts={accounts}
        targets={targets}
        disabled={creating.busy}
        onChange={draft.setActions}
      />
      <p className="rfm-sum" role="status" aria-label="Zhrnutie pravidla">
        {isCreatable(input)
          ? describeRule(input, targets, account.displayName)
          : 'Vyber aspoň jednu podmienku a jednu akciu.'}
      </p>
      <MailRulePreview input={input} />
      {mailActions ? (
        <label className="rfm-apply">
          <input
            type="checkbox"
            checked={draft.applyExisting}
            disabled={creating.busy}
            onChange={(event) => {
              draft.setApplyExisting(event.target.checked);
            }}
          />
          Použiť aj na existujúce maily v doručenej pošte
        </label>
      ) : null}
      <footer className="rfm-foot">
        <Button
          disabled={!ready}
          onClick={() => {
            openSeededRule(input);
          }}
        >
          Upraviť podrobne
        </Button>
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => {
            creating.create(input, mailActions && draft.applyExisting, onClose);
          }}
        >
          {creating.busy ? 'Vytváram…' : 'Vytvoriť'}
        </Button>
      </footer>
    </>
  );
}
