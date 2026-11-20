import type { MailAccount, RuleSuggestion } from '@relay/shared';
import { Segmented } from '@relay/ui';
import { useState } from 'react';
import { describeAction } from './action-targets';
import { ActionChecklist } from './ActionChecklist';
import { AdvancedSection } from './AdvancedSection';
import { AiSection } from './AiSection';
import { NEW_CONDITION_TYPE } from './condition-fields';
import { type EditableRule, missingPart, type RuleChange } from './editable-rule';
import { suggestionBasis } from './rule-ai/apply-suggestion';
import { RuleAiBar } from './rule-ai/RuleAiBar';
import { RuleDetailFooter } from './RuleDetailFooter';
import { ExceptionsSection } from './ExceptionsSection';
import { RuleDetailHeader } from './RuleDetailHeader';
import { RuleHistory } from './history/RuleHistory';
import { RulePreview } from './RulePreview';
import { RuleSummaryCard } from './RuleSummaryCard';
import { useActionTargets } from './use-action-targets';
import { useConditionRows } from './use-condition-rows';
import { useDirtyRows } from './use-dirty-rows';
import { useLiveDrafts } from './use-live-drafts';
import { withLiveDrafts } from './live-rule';
import { WhenSection } from './WhenSection';

type RuleView = 'settings' | 'history';

const RULE_VIEWS = [
  { value: 'settings', label: 'Nastavenie' },
  { value: 'history', label: 'História' },
] as const;

export interface AutomationDetailProps {
  readonly rule: EditableRule;
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly onBack: () => void;
  readonly onChange: (change: RuleChange) => void;
  readonly onSave: () => void;
  readonly onPropose: (suggestion: RuleSuggestion, sentence: string) => void;
  readonly onDiscard: () => void;
  readonly onRemove: () => void;
}

export function AutomationDetail({
  rule,
  accounts,
  disabled,
  onBack,
  onChange,
  onSave,
  onPropose,
  onDiscard,
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
  const [view, setView] = useState<RuleView>('settings');
  const missing = missingPart(rule);
  return (
    <section className="au-detail" aria-label={`Pravidlo ${input.name}`}>
      <RuleDetailHeader rule={rule} disabled={disabled} onBack={onBack} onChange={onChange} />
      <Segmented<RuleView>
        label="Zobrazenie pravidla"
        value={view}
        options={RULE_VIEWS}
        onChange={setView}
      />
      {view === 'history' ? (
        <RuleHistory automationId={rule.saved ? (input.id ?? null) : null} targets={targets} />
      ) : null}
      <div className="au-view" hidden={view === 'history'}>
        <RuleAiBar
          accountId={input.accountId}
          accounts={accounts}
          disabled={disabled}
          note={rule.suggestion ?? null}
          basis={suggestionBasis(previewInput)}
          onSuggest={onPropose}
        />
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
        {missing === null ? null : (
          <p className="au-hint" role="status">
            {missing}
          </p>
        )}
        <RuleDetailFooter
          rule={rule}
          disabled={disabled}
          dirty={conditions.dirty}
          onSave={onSave}
          onDiscard={onDiscard}
          onRemove={onRemove}
        />
      </div>
    </section>
  );
}
