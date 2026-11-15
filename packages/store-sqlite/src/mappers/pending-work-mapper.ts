import type { PendingWork, PendingWorkKind, PendingWorkPayloads } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { PendingWorkRow } from '../schema';

export const toPendingWork = <Kind extends PendingWorkKind>(
  row: PendingWorkRow,
): PendingWork<Kind> => ({
  accountId: row.accountId as AccountId,
  kind: row.kind as Kind,
  ref: row.ref,
  payload: row.payload as PendingWorkPayloads[Kind],
  revision: row.revision,
  createdAt: row.createdAt,
});
