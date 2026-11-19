import type { AutomationConditionType, AutomationInput, MailAccount } from '@relay/shared';
import { Button } from '@relay/ui';
import { Fragment, useState } from 'react';
import { describeCondition } from './automation-labels';
import { draftOf } from './condition-draft';
import { freshDraft, NEW_CONDITION_TYPE } from './condition-fields';
import { ConditionRow } from './ConditionRow';
import { type RuleChange, scopeChange } from './editable-rule';

export interface WhenSectionProps {
  readonly input: AutomationInput;
  readonly accounts: readonly MailAccount[];
  readonly needs: AutomationConditionType | null;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
}

export function WhenSection({ input, accounts, needs, disabled, onChange }: WhenSectionProps) {
  const { conditions } = input;
  const [pending, setPending] = useState<AutomationConditionType | null>(
    needs ?? (conditions.length === 0 ? NEW_CONDITION_TYPE : null),
  );
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
        {conditions.map((condition, index) => (
          <Fragment key={`${String(index)}-${JSON.stringify(condition)}`}>
            {index > 0 ? <span className="au-and">a zároveň</span> : null}
            <ConditionRow
              index={index}
              initial={draftOf(condition)}
              fresh={false}
              removeLabel={`Odstrániť podmienku ${describeCondition(condition)}`}
              disabled={disabled}
              onSave={(next) => {
                onChange({
                  conditions: conditions.map((item, position) =>
                    position === index ? next : item,
                  ),
                });
              }}
              onRemove={() => {
                onChange({ conditions: conditions.filter((_, position) => position !== index) });
              }}
            />
          </Fragment>
        ))}
        {pending === null ? null : (
          <Fragment key={`new-${String(conditions.length)}`}>
            {conditions.length > 0 ? <span className="au-and">a zároveň</span> : null}
            <ConditionRow
              index={conditions.length}
              initial={freshDraft(pending)}
              fresh
              removeLabel="Zrušiť novú podmienku"
              disabled={disabled}
              onSave={(condition) => {
                setPending(null);
                onChange({ conditions: [...conditions, condition] });
              }}
              onRemove={() => {
                setPending(null);
              }}
            />
          </Fragment>
        )}
      </div>
      <Button
        variant="ghost"
        className="au-add"
        disabled={disabled || pending !== null}
        onClick={() => {
          setPending(NEW_CONDITION_TYPE);
        }}
      >
        + Pridať podmienku
      </Button>
    </section>
  );
}
