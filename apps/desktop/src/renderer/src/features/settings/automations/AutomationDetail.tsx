import type { MailAccount } from '@relay/shared';
import { Button, Switch } from '@relay/ui';
import { SectionBackButton } from '../SectionHeader';
import { describeAction } from './action-targets';
import { ActionChecklist } from './ActionChecklist';
import { AdvancedSection } from './AdvancedSection';
import { AiSection } from './AiSection';
import { ApplyToExisting } from './ApplyToExisting';
import { NEW_CONDITION_TYPE } from './condition-fields';
import { type EditableRule, isComplete, type RuleChange } from './editable-rule';
import { ExceptionsSection } from './ExceptionsSection';
import { RuleName } from './RuleName';
import { RulePreview } from './RulePreview';
import { RuleSummaryCard } from './RuleSummaryCard';
import { useActionTargets } from './use-action-targets';
import { useConditionRows } from './use-condition-rows';
import { useDirtyRows } from './use-dirty-rows';
import { useLiveDrafts } from './use-live-drafts';
import { withLiveDrafts } from './live-rule';
import { WhenSection } from './WhenSection';

export interface AutomationDetailProps {
  readonly rule: EditableRule;
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onChange: (change: RuleChange) => void;
  readonly onRemove: () => void;
}

export function AutomationDetail({
  rule,
  accounts,
  disabled,
  onBack,
  onChange,
  onRemove,
}: AutomationDetailProps) {
  const { input } = rule;
  const targets = useActionTargets(input.accountId, accounts);
  const conditions = useDirtyRows();
  const conditionRows = useConditionRows(
    input.conditions,
    rule.pending ?? (input.conditions.length === 0 ? NEW_CONDITION_TYPE : null),
  );
  const exceptionRows = useConditionRows(input.exceptions, null);
  const live = useLiveDrafts();
  const tracker = { onDirty: conditions.mark, onLive: live.report };
  const previewInput = withLiveDrafts(input, conditionRows.rows, exceptionRows.rows, live.drafts);
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
      <RuleSummaryCard input={input} accounts={accounts} targets={targets} />
      <RulePreview input={previewInput} />
      <WhenSection
        input={input}
        accounts={accounts}
        rows={conditionRows}
        disabled={disabled}
        onChange={onChange}
        tracker={tracker}
      />
      <ExceptionsSection
        exceptions={input.exceptions}
        rows={exceptionRows}
        disabled={disabled}
        onChange={onChange}
        tracker={tracker}
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
      <AdvancedSection
        disabled={disabled}
        canAdd={{ conditions: conditionRows.canAdd, exceptions: exceptionRows.canAdd }}
        onAdd={(target, type) => {
          (target === 'exceptions' ? exceptionRows : conditionRows).addPending(type);
        }}
      />
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
          <ApplyToExisting
            automationId={input.id}
            actions={input.actions}
            disabled={disabled}
            blocked={conditions.dirty}
          />
        ) : null}
        <Button variant="danger" disabled={disabled} onClick={onRemove}>
          Odstrániť pravidlo
        </Button>
      </footer>
    </section>
  );
}
