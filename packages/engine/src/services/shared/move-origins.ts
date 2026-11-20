import type {
  AccountId,
  LabelId,
  MailboxId,
  MailboxRole,
  MessageId,
  MoveOriginRef,
} from '@relay/shared/domain';
import type { HeldOriginWork, MoveOriginWork } from '../../model/pending-work';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';

export type MoveOriginKind = 'trash-origin' | 'spam-origin' | 'move-origin';

export interface MoveOrigin {
  readonly role: MailboxRole;
  readonly mailboxId?: MailboxId;
  readonly labelId?: LabelId;
  readonly held?: readonly HeldOriginWork[];
  readonly markedDone?: boolean;
}

export const moveOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  kind: MoveOriginKind,
): Promise<Map<MessageId, MoveOrigin>> => {
  const origins = await pendingWork.list(accountId, kind);
  return new Map(origins.map(({ payload }) => [payload.messageId, payload]));
};

export const recordMoveOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  kind: MoveOriginKind,
  origins: readonly MoveOriginWork[],
  createdAt: string,
): Promise<MoveOriginRef[]> => {
  const recorded: MoveOriginRef[] = [];
  for (const origin of origins) {
    const stored = await pendingWork.put({
      accountId,
      kind,
      ref: origin.messageId,
      payload: origin,
      createdAt,
    });
    recorded.push({ messageId: origin.messageId, revision: stored.revision });
  }
  return recorded;
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

export const expireMoveOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  kind: MoveOriginKind,
  before: string,
): Promise<void> => {
  const origins = await pendingWork.list(accountId, kind);
  await pendingWork.remove(origins.filter((origin) => origin.createdAt < before));
};
