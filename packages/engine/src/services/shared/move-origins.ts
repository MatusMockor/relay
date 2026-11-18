import type { AccountId, MailboxRole, MessageId } from '@relay/shared/domain';
import type { MoveOriginWork } from '../../model/pending-work';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';

export type MoveOriginKind = 'trash-origin' | 'spam-origin';

export const moveOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  kind: MoveOriginKind,
): Promise<Map<MessageId, MailboxRole>> => {
  const origins = await pendingWork.list(accountId, kind);
  return new Map(origins.map((origin) => [origin.payload.messageId, origin.payload.role]));
};

export const recordMoveOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  kind: MoveOriginKind,
  origins: readonly MoveOriginWork[],
  createdAt: string,
): Promise<void> => {
  for (const origin of origins) {
    await pendingWork.put({ accountId, kind, ref: origin.messageId, payload: origin, createdAt });
  }
};

export const forgetMoveOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  kind: MoveOriginKind,
  messageIds: readonly MessageId[],
): Promise<void> => {
  if (messageIds.length === 0) {
    return;
  }
  const restored = new Set<string>(messageIds);
  const origins = await pendingWork.list(accountId, kind);
  await pendingWork.remove(origins.filter((origin) => restored.has(origin.ref)));
};
