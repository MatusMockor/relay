import { MAIL_AUTOMATION_ACTION_TYPES, type MailAccount } from '@relay/shared';
import { Button } from '@relay/ui';
import type { RuleInput } from '../settings/automations/editable-rule';
import { describeRule } from '../settings/automations/rule-summary';
import { openSeededRule } from '../settings/automations/seeded-rule';
import { useActionTargets } from '../settings/automations/use-action-targets';
import { isCreatable } from './mail-rule-input';
import { MailRulePreview } from './MailRulePreview';
import { QuickActionChips } from './QuickActionChips';
import type { CreateMailRule } from './use-create-mail-rule';
import type { MailRuleDraft } from './use-mail-rule-draft';

export interface MailRuleActionsProps {
  readonly account: MailAccount;
  readonly accounts: readonly MailAccount[];
  readonly input: RuleInput;
  readonly draft: MailRuleDraft;
  readonly creating: CreateMailRule;
  readonly onFile: () => void;
  readonly onClose: () => void;
}

export function MailRuleActions({
  account,
  accounts,
  input,
  draft,
  creating,
  onFile,
  onClose,
}: MailRuleActionsProps) {
  const targets = useActionTargets(account.id, accounts);
  const ready = isCreatable(input) && !creating.busy;
  const mailActions = input.actions.some((action) =>
    MAIL_AUTOMATION_ACTION_TYPES.includes(action.type),
  );
  return (
    <>
      <h4 className="rfm-sec">Potom</h4>
      <QuickActionChips
        actions={draft.actions}
        accountId={account.id}
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
        <Button disabled={input.conditions.length === 0 || creating.busy} onClick={onFile}>
          Zaradiť do splitu…
        </Button>
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
