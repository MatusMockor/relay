import type { AutomationCondition, AutomationConditionType } from '@relay/shared';
import { ConditionList } from './ConditionList';
import type { RuleChange } from './editable-rule';
import type { ConditionRowsState } from './use-condition-rows';
import type { RowTracker } from './use-live-drafts';

const COPY = {
  group: 'Výnimka',
  add: '+ Pridať výnimku',
  remove: 'Odstrániť výnimku',
  cancel: 'Zrušiť novú výnimku',
  limit: 'Najviac 20 výnimiek.',
};

export interface ExceptionsSectionProps {
  readonly exceptions: readonly AutomationCondition[];
  readonly rows: ConditionRowsState;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
  readonly tracker: RowTracker;
  readonly types?: readonly AutomationConditionType[];
  readonly lead?: string;
}

export function ExceptionsSection({
  exceptions,
  rows,
  disabled,
  onChange,
  tracker,
  types,
  lead = 'ak platí niektorá výnimka. Taký mail pravidlo preskočí, aj keď spĺňa podmienky.',
}: ExceptionsSectionProps) {
  return (
    <section className="au-sec" aria-labelledby="au-except">
      <h3 id="au-except">Okrem</h3>
      <p className="au-lead">{lead}</p>
      <ConditionList
        conditions={exceptions}
        state={rows}
        joiner="alebo"
        copy={COPY}
        disabled={disabled}
        onChange={(next) => {
          onChange({ exceptions: next });
        }}
        tracker={tracker}
        types={types}
      />
    </section>
  );
}
