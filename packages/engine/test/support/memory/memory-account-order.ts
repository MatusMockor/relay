import type { MailAccount, UserId } from '@relay/shared/domain';
import type { MemoryTables } from './memory-database';

const positionOf = (tables: MemoryTables, account: MailAccount): number =>
  tables.accountPositions.get(account.id) ?? 0;

export const inAccountOrder = (
  tables: MemoryTables,
  accounts: readonly MailAccount[],
): MailAccount[] =>
  [...accounts].sort(
    (left, right) =>
      positionOf(tables, left) - positionOf(tables, right) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );

export const nextAccountPosition = (tables: MemoryTables, userId: UserId): number => {
  const positions = [...tables.accounts.values()]
    .filter((account) => account.userId === userId)
    .map((account) => positionOf(tables, account));
  return positions.length === 0 ? 0 : Math.max(...positions) + 1;
};
