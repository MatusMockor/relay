import type { AccountId, MailboxRole, MessageId } from '@relay/shared/domain';
import type { TrashOriginWork } from '../../model/pending-work';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';

export const trashOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
): Promise<Map<MessageId, MailboxRole>> => {
  const origins = await pendingWork.list(accountId, 'trash-origin');
  return new Map(origins.map((origin) => [origin.payload.messageId, origin.payload.role]));
};

export const recordTrashOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  origins: readonly TrashOriginWork[],
  createdAt: string,
): Promise<void> => {
  for (const origin of origins) {
    await pendingWork.put({
      accountId,
      kind: 'trash-origin',
      ref: origin.messageId,
      payload: origin,
      createdAt,
    });
  }
};

export const forgetTrashOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  messageIds: readonly MessageId[],
): Promise<void> => {
  if (messageIds.length === 0) {
    return;
  }
  const restored = new Set<string>(messageIds);
  const origins = await pendingWork.list(accountId, 'trash-origin');
  await pendingWork.remove(origins.filter((origin) => restored.has(origin.ref)));
};
