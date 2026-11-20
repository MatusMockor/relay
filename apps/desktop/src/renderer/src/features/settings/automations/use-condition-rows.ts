import type { AutomationCondition, AutomationConditionType } from '@relay/shared';
import { useState } from 'react';
import { alignRows, type ConditionRows, initialRows, rowId } from './condition-rows';

export interface ConditionRowsState {
  readonly rows: ConditionRows;
  readonly addPending: (type: AutomationConditionType) => void;
  readonly dropPending: () => void;
}

export const useConditionRows = (
  conditions: readonly AutomationCondition[],
  pending: AutomationConditionType | null,
): ConditionRowsState => {
  const [stored, setRows] = useState(() => initialRows(conditions, pending));
  const rows = alignRows(stored, conditions);
  if (rows !== stored) {
    setRows(rows);
  }
  return {
    rows,
    addPending: (type) => {
      setRows({ ...rows, pending: { id: rowId(), type } });
    },
    dropPending: () => {
      setRows({ ...rows, pending: null });
    },
  };
};
