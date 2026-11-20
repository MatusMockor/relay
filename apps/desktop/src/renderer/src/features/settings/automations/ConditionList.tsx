import type { AutomationCondition } from '@relay/shared';
import { Button } from '@relay/ui';
import { Fragment } from 'react';
import { describeCondition } from './automation-labels';
import { NEW_CONDITION_TYPE } from './condition-fields';
import { ConditionRow } from './ConditionRow';
import type { ConditionRowsState } from './use-condition-rows';

export interface ConditionListCopy {
  readonly group: string;
  readonly add: string;
  readonly remove: string;
  readonly cancel: string;
}

export interface ConditionListProps {
  readonly conditions: readonly AutomationCondition[];
  readonly state: ConditionRowsState;
  readonly joiner: string;
  readonly copy: ConditionListCopy;
  readonly disabled: boolean;
  readonly onChange: (conditions: AutomationCondition[]) => void;
  readonly onDirty: (id: string, dirty: boolean) => void;
}

export function ConditionList({
  conditions,
  state,
  joiner,
  copy,
  disabled,
  onChange,
  onDirty,
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
                onDirty={onDirty}
              />
            </Fragment>
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        className="au-add"
        disabled={disabled || rows.pending !== null}
        onClick={() => {
          state.addPending(NEW_CONDITION_TYPE);
        }}
      >
        {copy.add}
      </Button>
    </>
  );
}
