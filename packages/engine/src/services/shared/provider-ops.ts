import type { AccountId, MailboxId, MessageId } from '@relay/shared/domain';
import type { PendingWork, ProviderChange, ProviderOpWork } from '../../model/pending-work';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';

export type PendingProviderOp = PendingWork<'provider-op'>;

const moveKey = (source: MailboxId | undefined): string =>
  source === undefined ? 'move' : `move:${source}`;

const changeKey = (change: ProviderChange, source: MailboxId | undefined): string => {
  switch (change.kind) {
    case 'flag':
      return `flag:${change.flag}`;
    case 'keyword':
      return `keyword:${change.keyword}`;
    case 'label':
      return `label:${change.label}`;
    case 'move':
      return moveKey(source);
  }
};

export const providerOpRef = (
  messageId: MessageId,
  change: ProviderChange,
  source?: MailboxId,
): string => `${messageId}:${changeKey(change, source)}`;

export const legacyMoveRef = (messageId: MessageId): string => `${messageId}:${moveKey(undefined)}`;

const dropLegacyMove = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  op: ProviderOpWork,
): Promise<void> => {
  if (op.change.kind !== 'move' || op.source === undefined) {
    return;
  }
  const ref = legacyMoveRef(op.messageId);
  const legacy = await pendingWork.find({ accountId, kind: 'provider-op', ref });
  if (legacy === null) {
    return;
  }
  await pendingWork.remove([legacy]);
};

export const recordProviderOps = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  ops: readonly ProviderOpWork[],
  createdAt: string,
): Promise<PendingProviderOp[]> => {
  const recorded: PendingProviderOp[] = [];
  for (const op of ops) {
    await dropLegacyMove(pendingWork, accountId, op);
    recorded.push(
      await pendingWork.put({
        accountId,
        kind: 'provider-op',
        ref: providerOpRef(op.messageId, op.change, op.source?.mailboxId),
        payload: op,
        createdAt,
      }),
    );
  }
  return recorded;
};
