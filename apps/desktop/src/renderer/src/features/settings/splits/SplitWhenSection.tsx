import type { AutomationMatchMode, MailAccount } from '@relay/shared';
import { Segmented } from '@relay/ui';
import { ConditionList } from '../automations/ConditionList';
import { MATCH_JOINERS } from '../automations/rule-summary';
import type { ConditionRowsState } from '../automations/use-condition-rows';
import type { RowTracker } from '../automations/use-live-drafts';
import { toSplitRules } from '../../../data/split-input';
import { SPLIT_CONDITION_TYPES, type SplitChange, type SplitDraft } from './split-draft';

const MATCH_OPTIONS: readonly { value: AutomationMatchMode; label: string }[] = [
  { value: 'all', label: 'všetky' },
  { value: 'any', label: 'ktorúkoľvek' },
];

const COPY = {
  group: 'Podmienka',
  add: '+ Pridať podmienku',
  remove: 'Odstrániť podmienku',
  cancel: 'Zrušiť novú podmienku',
  limit: 'Najviac 20 podmienok.',
};

export interface SplitWhenSectionProps {
  readonly draft: SplitDraft;
  readonly accounts: readonly MailAccount[];
  readonly rows: ConditionRowsState;
  readonly disabled: boolean;
  readonly onChange: (change: SplitChange) => void;
  readonly tracker: RowTracker;
}

export function SplitWhenSection({
  draft,
  accounts,
  rows,
  disabled,
  onChange,
  tracker,
}: SplitWhenSectionProps) {
  return (
    <section className="au-sec" aria-labelledby="au-when">
      <h3 id="au-when">Keď</h3>
      <label className="fld au-scope">
        <span>Účet</span>
        <select
          value={draft.accountId ?? ''}
          disabled={disabled}
          onChange={(event) => {
            const next = accounts.find((account) => account.id === event.target.value);
            onChange({ accountId: next?.id ?? null });
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
          value={draft.match}
          disabled={disabled}
          onChange={(match) => {
            onChange({ match });
          }}
        />
        <span>z podmienok</span>
      </div>
      <ConditionList
        conditions={draft.rules}
        state={rows}
        joiner={MATCH_JOINERS[draft.match]}
        copy={COPY}
        disabled={disabled}
        types={SPLIT_CONDITION_TYPES}
        onChange={(conditions) => {
          onChange({ rules: toSplitRules(conditions) });
        }}
        tracker={tracker}
      />
    </section>
  );
}
