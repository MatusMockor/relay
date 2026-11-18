import type { Label, UserId } from '@relay/shared/domain';
import type { labels } from '../../schema';

type LabelRow = typeof labels.$inferSelect;
type LabelInsert = typeof labels.$inferInsert;

export const toLabel = (row: LabelRow): Label => ({
  id: row.id,
  accountId: row.accountId,
  name: row.name,
  color: row.color,
  kind: row.kind,
  remoteName: row.remoteName,
});

export const toLabelInsert = (userId: UserId, label: Label): LabelInsert => ({
  id: label.id,
  userId,
  accountId: label.accountId,
  name: label.name,
  color: label.color,
  kind: label.kind,
  remoteName: label.remoteName,
});
