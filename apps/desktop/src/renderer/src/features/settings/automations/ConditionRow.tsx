import type {
  AutomationCondition,
  AutomationConditionType,
  JiraEventKind,
  RecipientField,
} from '@relay/shared';
import { Icon } from '@relay/ui';
import { useState } from 'react';
import {
  CONDITION_TYPE_LABELS,
  JIRA_EVENT_LABELS,
  RECIPIENT_FIELD_LABELS,
} from './automation-labels';
import { type ConditionDraft, conditionOf } from './condition-draft';
import {
  CONDITION_TYPES,
  freshDraft,
  isBlank,
  JIRA_EVENT_KINDS,
  RECIPIENT_FIELDS,
  usesPattern,
  VALUE_FIELDS,
} from './condition-fields';
import { ConditionSelect, ConditionText } from './ConditionControls';

export interface ConditionRowProps {
  readonly index: number;
  readonly initial: ConditionDraft;
  readonly fresh: boolean;
  readonly removeLabel: string;
  readonly disabled: boolean;
  readonly onSave: (condition: AutomationCondition) => void;
  readonly onRemove: () => void;
}

export function ConditionRow({
  index,
  initial,
  fresh,
  removeLabel,
  disabled,
  onSave,
  onRemove,
}: ConditionRowProps) {
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const [baseline] = useState(() => JSON.stringify(conditionOf(initial)));
  const attempt = (next: ConditionDraft, strict: boolean) => {
    const condition = conditionOf(next);
    setInvalid(condition === null && strict);
    if (condition === null || (!fresh && JSON.stringify(condition) === baseline)) {
      return;
    }
    onSave(condition);
  };
  const pick = (change: Partial<ConditionDraft>) => {
    const next = { ...draft, ...change };
    setDraft(next);
    attempt(next, false);
  };
  const type = (change: Partial<ConditionDraft>) => {
    setInvalid(false);
    setDraft((current) => ({ ...current, ...change }));
  };
  const commit = (strict: boolean) => {
    attempt(draft, strict || !(fresh && isBlank(draft)));
  };
  const valueField = VALUE_FIELDS[draft.type];
  return (
    <div className="au-cond-w">
      <div className="au-cond" role="group" aria-label={`Podmienka ${String(index + 1)}`}>
        <ConditionSelect<AutomationConditionType>
          label="Typ podmienky"
          value={draft.type}
          options={CONDITION_TYPES}
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
            disabled={disabled}
            autoFocus={fresh}
            onChange={(value) => {
              type({ value });
            }}
            onCommit={commit}
          />
        )}
        {usesPattern(draft.type) ? (
          <ConditionText
            label="Obsahuje (regulárny výraz)"
            placeholder="faktúra|objednávka"
            value={draft.pattern}
            disabled={disabled}
            autoFocus={fresh && valueField === undefined}
            onChange={(pattern) => {
              type({ pattern });
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
