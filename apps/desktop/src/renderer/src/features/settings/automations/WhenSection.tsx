import type { AutomationMatchMode, MailAccount } from '@relay/shared';
import { Segmented } from '@relay/ui';
import { ConditionList } from './ConditionList';
import { type RuleChange, scopeChange, type RuleInput } from './editable-rule';
import { MATCH_JOINERS } from './rule-summary';
import type { ConditionRowsState } from './use-condition-rows';

const MATCH_OPTIONS: readonly { value: AutomationMatchMode; label: string }[] = [
  { value: 'all', label: 'všetky' },
  { value: 'any', label: 'ktorúkoľvek' },
];

const COPY = {
  group: 'Podmienka',
  add: '+ Pridať podmienku',
  remove: 'Odstrániť podmienku',
  cancel: 'Zrušiť novú podmienku',
};

export interface WhenSectionProps {
  readonly input: RuleInput;
  readonly accounts: readonly MailAccount[];
  readonly rows: ConditionRowsState;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
  readonly onDirty: (id: string, dirty: boolean) => void;
}

export function WhenSection({
  input,
  accounts,
  rows,
  disabled,
  onChange,
  onDirty,
}: WhenSectionProps) {
  return (
    <section className="au-sec" aria-labelledby="au-when">
      <h3 id="au-when">Keď</h3>
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
      <div className="au-match">
        <span>Mail spĺňa</span>
        <Segmented<AutomationMatchMode>
          label="Koľko podmienok musí mail splniť"
          options={MATCH_OPTIONS}
          value={input.match}
          disabled={disabled}
          onChange={(match) => {
            onChange({ match });
          }}
        />
        <span>z podmienok</span>
      </div>
      <ConditionList
        conditions={input.conditions}
        state={rows}
        joiner={MATCH_JOINERS[input.match]}
        copy={COPY}
        disabled={disabled}
        onChange={(conditions) => {
          onChange({ conditions });
        }}
        onDirty={onDirty}
      />
    </section>
  );
}
