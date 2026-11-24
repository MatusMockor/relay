import type { AutomationCondition, AutomationConditionType } from '@relay/shared';
import { Button } from '@relay/ui';
import { Fragment } from 'react';
import { describeCondition } from './automation-labels';
import { NEW_CONDITION_TYPE } from './condition-fields';
import { ConditionRow } from './ConditionRow';
import type { ConditionRowsState } from './use-condition-rows';
import type { RowTracker } from './use-live-drafts';

export interface ConditionListCopy {
  readonly group: string;
  readonly add: string;
  readonly remove: string;
  readonly cancel: string;
  readonly limit: string;
}

export interface ConditionListProps {
  readonly conditions: readonly AutomationCondition[];
  readonly state: ConditionRowsState;
  readonly joiner: string;
  readonly copy: ConditionListCopy;
  readonly disabled: boolean;
  readonly onChange: (conditions: AutomationCondition[]) => void;
  readonly tracker: RowTracker;
  readonly types?: readonly AutomationConditionType[];
}

export function ConditionList({
  conditions,
  state,
  joiner,
  copy,
  disabled,
  onChange,
  tracker,
  types,
}: ConditionListProps) {
  const { rows } = state;
  const entries = [
    ...rows.ids.map((id, index) => ({
      id,
      condition: conditions[index] ?? null,
      type: NEW_CONDITION_TYPE,
    })),
    ...(rows.pending === null ? [] : [{ ...rows.pending, condition: null }]),
  ];
  return (
    <>
      {entries.length === 0 ? null : (
        <div className="au-conds">
          {entries.map((entry, index) => (
            <Fragment key={entry.id}>
              {index > 0 ? <span className="au-and">{joiner}</span> : null}
              <ConditionRow
                id={entry.id}
                index={index}
                groupLabel={copy.group}
                condition={entry.condition}
                freshType={entry.type}
                removeLabel={
                  entry.condition === null
                    ? copy.cancel
                    : `${copy.remove} ${describeCondition(entry.condition)}`
                }
                disabled={disabled}
                onSave={(next) => {
                  onChange(
                    entry.condition === null
                      ? [...conditions, next]
                      : conditions.map((item, position) => (position === index ? next : item)),
                  );
                }}
                onRemove={() => {
                  if (entry.condition === null) {
                    state.dropPending();
                    return;
                  }
                  onChange(conditions.filter((_, position) => position !== index));
                }}
                tracker={tracker}
                types={types}
              />
            </Fragment>
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        className="au-add"
        disabled={disabled || !state.canAdd}
        onClick={() => {
          state.addPending(NEW_CONDITION_TYPE);
        }}
      >
        {copy.add}
      </Button>
      {state.full ? <p className="au-note">{copy.limit}</p> : null}
    </>
  );
}
