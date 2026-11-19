import type { AutomationConditionType, MailAccount } from '@relay/shared';
import { Button, Switch } from '@relay/ui';
import { SectionBackButton } from '../SectionHeader';
import { describeAction } from './action-targets';
import { ActionChecklist } from './ActionChecklist';
import { AiSection } from './AiSection';
import { ApplyToExisting } from './ApplyToExisting';
import { type EditableRule, isComplete, type RuleChange } from './editable-rule';
import { RuleName } from './RuleName';
import { useActionTargets } from './use-action-targets';
import { WhenSection } from './WhenSection';

export interface AutomationDetailProps {
  readonly rule: EditableRule;
  readonly accounts: readonly MailAccount[];
  readonly needs: AutomationConditionType | null;
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onChange: (change: RuleChange) => void;
  readonly onRemove: () => void;
}

export function AutomationDetail({
  rule,
  accounts,
  needs,
  disabled,
  onBack,
  onChange,
  onRemove,
}: AutomationDetailProps) {
  const { input } = rule;
  const targets = useActionTargets(input.accountId, accounts);
  const broken = input.actions.some((action) => describeAction(action, targets).broken);
  return (
    <section className="au-detail" aria-label={`Pravidlo ${input.name}`}>
      <header className="sh-head au-dh">
        <SectionBackButton
          label="Automatizácie"
          ariaLabel="Späť na automatizácie"
          onBack={onBack}
        />
        <div className="au-dt">
          <h2>
            <RuleName
              name={input.name}
              disabled={disabled}
              onRename={(name) => {
                onChange({ name });
              }}
            />
          </h2>
          {rule.preset === null ? null : <span className="scope">Predvolené</span>}
          {rule.saved ? null : <span className="scope warn">Neuložené</span>}
          <Switch
            checked={input.enabled}
            label={`Pravidlo ${input.name} zapnuté`}
            disabled={disabled}
            onChange={(enabled) => {
              onChange({ enabled });
            }}
          />
        </div>
      </header>
      <WhenSection
        input={input}
        accounts={accounts}
        needs={needs}
        disabled={disabled}
        onChange={onChange}
      />
      <ActionChecklist
        actions={input.actions}
        accountId={input.accountId}
        accounts={accounts}
        targets={targets}
        disabled={disabled}
        onChange={onChange}
      />
      <AiSection input={input} disabled={disabled} onChange={onChange} />
      {broken ? (
        <p className="au-hint" role="status">
          Cieľ niektorej akcie už neexistuje. Pravidlo ostatné akcie vykoná, túto preskočí.
        </p>
      ) : null}
      {isComplete(rule) ? null : (
        <p className="au-hint" role="status">
          Pridaj aspoň jednu podmienku, potom sa pravidlo uloží.
        </p>
      )}
      <footer className="au-foot">
        {rule.saved && input.id !== undefined ? (
          <ApplyToExisting automationId={input.id} actions={input.actions} disabled={disabled} />
        ) : null}
        <Button variant="danger" disabled={disabled} onClick={onRemove}>
          Odstrániť pravidlo
        </Button>
      </footer>
    </section>
  );
}
