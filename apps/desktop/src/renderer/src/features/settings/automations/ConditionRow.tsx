import type {
  AutomationCondition,
  AutomationConditionType,
  JiraEventKind,
  RecipientField,
} from '@relay/shared';
import { Icon } from '@relay/ui';
import {
  CONDITION_TYPE_LABELS,
  JIRA_EVENT_LABELS,
  RECIPIENT_FIELD_LABELS,
} from './automation-labels';
import {
  conditionTypesFor,
  freshDraft,
  JIRA_EVENT_KINDS,
  RECIPIENT_FIELDS,
  usesPattern,
  VALUE_FIELDS,
} from './condition-fields';
import { ConditionSelect, ConditionText } from './ConditionControls';
import { useConditionDraft } from './use-condition-draft';
import type { RowTracker } from './use-live-drafts';

export interface ConditionRowProps {
  readonly id: string;
  readonly index: number;
  readonly groupLabel: string;
  readonly condition: AutomationCondition | null;
  readonly freshType: AutomationConditionType;
  readonly removeLabel: string;
  readonly disabled: boolean;
  readonly onSave: (condition: AutomationCondition) => void;
  readonly onRemove: () => void;
  readonly tracker: RowTracker;
  readonly types?: readonly AutomationConditionType[];
}

export function ConditionRow({
  id,
  index,
  groupLabel,
  condition: saved,
  freshType,
  removeLabel,
  disabled,
  onSave,
  onRemove,
  tracker,
  types,
}: ConditionRowProps) {
  const { draft, fresh, invalid, pick, edit, commit } = useConditionDraft({
    id,
    saved,
    freshType,
    onSave,
    tracker,
  });
  const valueField = VALUE_FIELDS[draft.type];
  return (
    <div className="au-cond-w">
      <div className="au-cond" role="group" aria-label={`${groupLabel} ${String(index + 1)}`}>
        <ConditionSelect<AutomationConditionType>
          label="Typ podmienky"
          value={draft.type}
          options={conditionTypesFor(draft.type, types)}
          labels={CONDITION_TYPE_LABELS}
          disabled={disabled}
          onChange={(next) => {
            pick({ ...freshDraft(next), kind: draft.kind, field: draft.field });
          }}
        />
        {draft.type === 'jiraEvent' ? (
          <ConditionSelect<JiraEventKind>
            label="Udalosť"
            value={draft.kind}
            options={JIRA_EVENT_KINDS}
            labels={JIRA_EVENT_LABELS}
            disabled={disabled}
            onChange={(kind) => {
              pick({ kind });
            }}
          />
        ) : null}
        {draft.type === 'recipient' ? (
          <ConditionSelect<RecipientField>
            label="Pole"
            value={draft.field}
            options={RECIPIENT_FIELDS}
            labels={RECIPIENT_FIELD_LABELS}
            disabled={disabled}
            onChange={(field) => {
              pick({ field });
            }}
          />
        ) : null}
        {valueField === undefined ? null : (
          <ConditionText
            label={valueField[0]}
            placeholder={valueField[1]}
            value={draft.value}
            readOnly={disabled}
            autoFocus={fresh}
            onChange={(value) => {
              edit({ value });
            }}
            onCommit={commit}
          />
        )}
        {usesPattern(draft.type) ? (
          <ConditionText
            label="Obsahuje (regulárny výraz)"
            placeholder="faktúra|objednávka"
            value={draft.pattern}
            readOnly={disabled}
            autoFocus={fresh && valueField === undefined}
            onChange={(pattern) => {
              edit({ pattern });
            }}
            onCommit={commit}
          />
        ) : null}
        <button
          type="button"
          className="au-x"
          aria-label={removeLabel}
          title={removeLabel}
          disabled={disabled}
          onClick={onRemove}
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      {invalid ? <p className="au-hint">Doplň podmienku správne.</p> : null}
    </div>
  );
}
