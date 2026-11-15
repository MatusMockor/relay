import { type Split, SplitSchema, type UserId } from '@relay/shared/domain';
import type { SplitRow, splits } from '../schema';

export const toSplit = (row: SplitRow): Split =>
  SplitSchema.parse({
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    name: row.name,
    order: row.position,
    rules: row.rules,
    exclusive: row.exclusive,
  });

export const toSplitRow = (userId: UserId, split: Split): typeof splits.$inferInsert => ({
  id: split.id,
  userId,
  accountId: split.accountId,
  name: split.name,
  position: split.order,
  rules: split.rules,
  exclusive: split.exclusive,
});
