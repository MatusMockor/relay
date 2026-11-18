import { labelNameKey } from './label';

export const LABEL_NAME_KEY_SEPARATOR = '\u0001';

export interface StoredLabelKey {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly nameKey: string;
}

export interface LabelKeyChange {
  readonly id: string;
  readonly nameKey: string;
}

const holdsOwnKey = (row: StoredLabelKey): number =>
  row.nameKey === labelNameKey(row.name) ? 0 : 1;

const claimOrder = (left: StoredLabelKey, right: StoredLabelKey): number =>
  left.accountId.localeCompare(right.accountId) ||
  holdsOwnKey(left) - holdsOwnKey(right) ||
  left.id.localeCompare(right.id);

export const repairedLabelNameKeys = (rows: readonly StoredLabelKey[]): LabelKeyChange[] => {
  const taken = new Set<string>();
  const changes: LabelKeyChange[] = [];
  for (const row of [...rows].sort(claimOrder)) {
    const base = labelNameKey(row.name);
    const scoped = (key: string) => `${row.accountId}${LABEL_NAME_KEY_SEPARATOR}${key}`;
    const nameKey = taken.has(scoped(base)) ? `${base}${LABEL_NAME_KEY_SEPARATOR}${row.id}` : base;
    taken.add(scoped(nameKey));
    if (nameKey !== row.nameKey) {
      changes.push({ id: row.id, nameKey });
    }
  }
  return changes;
};
