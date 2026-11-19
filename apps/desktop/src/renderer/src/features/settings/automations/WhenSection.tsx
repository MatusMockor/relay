import type { AutomationConditionType, AutomationInput, MailAccount } from '@relay/shared';
import { Button } from '@relay/ui';
import { Fragment, useState } from 'react';
import { describeCondition } from './automation-labels';
import { NEW_CONDITION_TYPE } from './condition-fields';
import { alignRows, initialRows, rowId } from './condition-rows';
import { ConditionRow } from './ConditionRow';
import { type RuleChange, scopeChange } from './editable-rule';

export interface WhenSectionProps {
  readonly input: AutomationInput;
  readonly accounts: readonly MailAccount[];
  readonly pending: AutomationConditionType | null;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
  readonly onDirty: (id: string, dirty: boolean) => void;
}

export function WhenSection({
  input,
  accounts,
  pending,
  disabled,
  onChange,
  onDirty,
}: WhenSectionProps) {
  const { conditions } = input;
  const [stored, setRows] = useState(() =>
    initialRows(conditions, pending ?? (conditions.length === 0 ? NEW_CONDITION_TYPE : null)),
  );
  const rows = alignRows(stored, conditions);
  if (rows !== stored) {
    setRows(rows);
  }
  const entries = [
    ...rows.ids.map((id, index) => ({
      id,
      condition: conditions[index] ?? null,
      type: NEW_CONDITION_TYPE,
    })),
    ...(rows.pending === null ? [] : [{ ...rows.pending, condition: null }]),
  ];
  return (
    <section className="au-sec" aria-labelledby="au-when">
      <h3 id="au-when">Kedy</h3>
      <label className="fld au-scope">
        <span>Účet</span>
        <select
          value={input.accountId ?? ''}
          disabled={disabled}
          onChange={(event) => {
            const next = accounts.find((account) => account.id === event.target.value);
            onChange(scopeChange(input.actions, input.accountId, next?.id ?? null));
          }}
        >
          <option value="">Všetky účty</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className="au-conds">
        {entries.map((entry, index) => (
          <Fragment key={entry.id}>
            {index > 0 ? <span className="au-and">a zároveň</span> : null}
            <ConditionRow
              id={entry.id}
              index={index}
              condition={entry.condition}
              freshType={entry.type}
              removeLabel={
                entry.condition === null
                  ? 'Zrušiť novú podmienku'
                  : `Odstrániť podmienku ${describeCondition(entry.condition)}`
              }
              disabled={disabled}
              onSave={(next) => {
                onChange({
                  conditions:
                    entry.condition === null
                      ? [...conditions, next]
                      : conditions.map((item, position) => (position === index ? next : item)),
                });
              }}
              onRemove={() => {
                if (entry.condition === null) {
                  setRows({ ...rows, pending: null });
                  return;
                }
                onChange({ conditions: conditions.filter((_, position) => position !== index) });
              }}
              onDirty={onDirty}
            />
          </Fragment>
        ))}
      </div>
      <Button
        variant="ghost"
        className="au-add"
        disabled={disabled || rows.pending !== null}
        onClick={() => {
          setRows({ ...rows, pending: { id: rowId(), type: NEW_CONDITION_TYPE } });
        }}
      >
        + Pridať podmienku
      </Button>
    </section>
  );
}
