import type { AutomationCondition, AutomationConditionType } from '@relay/shared';

export interface PendingRow {
  readonly id: string;
  readonly type: AutomationConditionType;
}

export interface ConditionRows {
  readonly known: readonly AutomationCondition[];
  readonly ids: readonly string[];
  readonly pending: PendingRow | null;
}

let lastId = 0;

export const rowId = (): string => {
  lastId += 1;
  return `condition-${String(lastId)}`;
};

const same = (left: AutomationCondition | undefined, right: AutomationCondition | undefined) =>
  JSON.stringify(left) === JSON.stringify(right);

const keepsOrder = (
  known: readonly AutomationCondition[],
  next: readonly AutomationCondition[],
): boolean => known.every((condition, index) => same(condition, next[index]));

export const initialRows = (
  conditions: readonly AutomationCondition[],
  pending: AutomationConditionType | null,
): ConditionRows => ({
  known: conditions,
  ids: conditions.map(rowId),
  pending: pending === null ? null : { id: rowId(), type: pending },
});

export const alignRows = (
  rows: ConditionRows,
  next: readonly AutomationCondition[],
): ConditionRows => {
  const { known, ids, pending } = rows;
  if (known === next) {
    return rows;
  }
  if (next.length === known.length) {
    return { ...rows, known: next };
  }
  if (next.length === known.length + 1 && pending !== null && keepsOrder(known, next)) {
    return { known: next, ids: [...ids, pending.id], pending: null };
  }
  const removed = known.findIndex((condition, index) => !same(condition, next[index]));
  const rest = known.filter((_, index) => index !== removed);
  if (next.length === known.length - 1 && keepsOrder(rest, next)) {
    return { known: next, ids: ids.filter((_, index) => index !== removed), pending };
  }
  return { known: next, ids: next.map(rowId), pending };
};
