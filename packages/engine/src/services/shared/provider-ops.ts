import type { AccountId, MailboxRole, MessageId } from '@relay/shared/domain';
import type { PendingWork, ProviderChange, ProviderOpWork } from '../../model/pending-work';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';

export type PendingProviderOp = PendingWork<'provider-op'>;

const changeKey = (change: ProviderChange): string => {
  switch (change.kind) {
    case 'flag':
      return `flag:${change.flag}`;
    case 'keyword':
      return `keyword:${change.keyword}`;
    case 'move':
      return 'move';
  }
};

export const recordProviderOps = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  ops: readonly ProviderOpWork[],
  createdAt: string,
): Promise<PendingProviderOp[]> => {
  const recorded: PendingProviderOp[] = [];
  for (const op of ops) {
    recorded.push(
      await pendingWork.put({
        accountId,
        kind: 'provider-op',
        ref: `${op.messageId}:${changeKey(op.change)}`,
        payload: op,
        createdAt,
      }),
    );
  }
  return recorded;
};

export const pendingMoveRoles = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
): Promise<Map<MessageId, MailboxRole>> => {
  const ops = await pendingWork.list(accountId, 'provider-op');
  return new Map(
    ops.flatMap((op) =>
      op.payload.change.kind === 'move'
        ? [[op.payload.messageId, op.payload.change.role] as const]
        : [],
    ),
  );
};
