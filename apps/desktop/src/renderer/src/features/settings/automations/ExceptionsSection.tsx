import type { AutomationCondition } from '@relay/shared';
import { ConditionList } from './ConditionList';
import type { RuleChange } from './editable-rule';
import type { ConditionRowsState } from './use-condition-rows';

const COPY = {
  group: 'Výnimka',
  add: '+ Pridať výnimku',
  remove: 'Odstrániť výnimku',
  cancel: 'Zrušiť novú výnimku',
};

export interface ExceptionsSectionProps {
  readonly exceptions: readonly AutomationCondition[];
  readonly rows: ConditionRowsState;
  readonly disabled: boolean;
  readonly onChange: (change: RuleChange) => void;
  readonly onDirty: (id: string, dirty: boolean) => void;
}

export function ExceptionsSection({
  exceptions,
  rows,
  disabled,
  onChange,
  onDirty,
}: ExceptionsSectionProps) {
  return (
    <section className="au-sec" aria-labelledby="au-except">
      <h3 id="au-except">Okrem</h3>
      <p className="au-lead">
        ak platí niektorá výnimka. Taký mail pravidlo preskočí, aj keď spĺňa podmienky.
      </p>
      <ConditionList
        conditions={exceptions}
        state={rows}
        joiner="alebo"
        copy={COPY}
        disabled={disabled}
        onChange={(next) => {
          onChange({ exceptions: next });
        }}
        onDirty={onDirty}
      />
    </section>
  );
}
