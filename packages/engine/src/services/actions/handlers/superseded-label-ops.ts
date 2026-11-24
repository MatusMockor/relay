import type { AccountId, Message, MessageId } from '@relay/shared/domain';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import type { MailCopies } from '../../shared/mail-copies';
import type { PendingProviderOp } from '../../shared/provider-ops';
import type { ResolvedLabelChange } from './label-change-writer';

const plannedKeys = (
  copies: MailCopies,
  byId: ReadonlyMap<MessageId, Message>,
  changes: readonly ResolvedLabelChange[],
): Set<string> =>
  new Set(
    changes.flatMap(({ label, change }) =>
      change.providerMessageIds.flatMap((messageId) => {
        const message = byId.get(messageId);
        return message === undefined ? [] : [`${label.remoteName}|${copies.logicalKeyOf(message)}`];
      }),
    ),
  );

const superseded = (
  op: PendingProviderOp,
  copies: MailCopies,
  byId: ReadonlyMap<MessageId, Message>,
  planned: ReadonlySet<string>,
): boolean => {
  const { change, messageId } = op.payload;
  const owner = byId.get(messageId);
  if (change.kind !== 'label' || owner === undefined) {
    return false;
  }
  return planned.has(`${change.label}|${copies.logicalKeyOf(owner)}`);
};

export const dropSupersededLabelOps = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  copies: MailCopies,
  messages: readonly Message[],
  changes: readonly ResolvedLabelChange[],
): Promise<void> => {
  if (changes.length === 0) {
    return;
  }
  const byId = new Map(messages.map((message) => [message.id, message]));
  const planned = plannedKeys(copies, byId, changes);
  const ops = await pendingWork.list(accountId, 'provider-op');
  await pendingWork.remove(ops.filter((op) => superseded(op, copies, byId, planned)));
};
