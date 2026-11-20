import {
  type AutomationCondition,
  type AutomationConditionType,
  MAX_AUTOMATION_CONDITIONS,
} from '@relay/shared';
import { useState } from 'react';
import { alignRows, type ConditionRows, initialRows, rowId } from './condition-rows';

export interface ConditionRowsState {
  readonly rows: ConditionRows;
  readonly full: boolean;
  readonly canAdd: boolean;
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
  const full = conditions.length >= MAX_AUTOMATION_CONDITIONS;
  const canAdd = rows.pending === null && !full;
  return {
    rows,
    full,
    canAdd,
    addPending: (type) => {
      if (!canAdd) {
        return;
      }
      setRows({ ...rows, pending: { id: rowId(), type } });
    },
    dropPending: () => {
      setRows({ ...rows, pending: null });
    },
  };
};
