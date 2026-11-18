import type { Split } from '@relay/shared/domain';
import type { splits } from '../../schema';

type SplitRow = typeof splits.$inferSelect;
type SplitInsert = typeof splits.$inferInsert;

export const toSplit = (row: SplitRow): Split => ({
  id: row.id,
  userId: row.userId,
  accountId: row.accountId,
  name: row.name,
  order: row.position,
  rules: row.rules,
  exclusive: row.exclusive,
  hideTasks: row.hideTasks,
});

export const toSplitInsert = (split: Split): SplitInsert => ({
  id: split.id,
  userId: split.userId,
  accountId: split.accountId,
  name: split.name,
  position: split.order,
  rules: split.rules,
  exclusive: split.exclusive,
  hideTasks: split.hideTasks,
});
