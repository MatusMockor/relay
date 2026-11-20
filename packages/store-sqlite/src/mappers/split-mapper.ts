import { type Split, type SplitEntry, splitEntryOf, type UserId } from '@relay/shared/domain';
import type { SplitRow, splits } from '../schema';

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

export const toSplitRow = (userId: UserId, split: Split): typeof splits.$inferInsert => ({
  id: split.id,
  userId,
  accountId: split.accountId,
  name: split.name,
  position: split.order,
  match: split.match,
  rules: split.rules,
  exceptions: split.exceptions,
  exclusive: split.exclusive,
  hideTasks: split.hideTasks,
});
