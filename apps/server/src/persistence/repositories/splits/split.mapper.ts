import { type Split, type SplitEntry, splitEntryOf } from '@relay/shared/domain';
import type { splits } from '../../schema';

type SplitRow = typeof splits.$inferSelect;
type SplitInsert = typeof splits.$inferInsert;

export const toSplitEntry = (row: SplitRow): SplitEntry => {
  const entry = splitEntryOf({
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    name: row.name,
    order: row.position,
    match: row.match,
    rules: row.rules,
    exceptions: row.exceptions,
    exclusive: row.exclusive,
    hideTasks: row.hideTasks,
  });
  if (entry === null) {
    throw new Error(`Split ${row.id} is not readable`);
  }
  return entry;
};

export const toSplitInsert = (split: Split): SplitInsert => ({
  id: split.id,
  userId: split.userId,
  accountId: split.accountId,
  name: split.name,
  position: split.order,
  match: split.match,
  rules: split.rules,
  exceptions: split.exceptions,
  exclusive: split.exclusive,
  hideTasks: split.hideTasks,
});
