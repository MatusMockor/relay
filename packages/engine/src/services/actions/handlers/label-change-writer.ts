import type { AccountId, Label, UserId } from '@relay/shared/domain';
import type { LabelRepository } from '../../../ports/label-repository';
import type { Repositories } from '../../../ports/repositories';
import { type PendingProviderOp, recordProviderOps } from '../../shared/provider-ops';
import type { LabelChange } from './state-move-plan';

export interface ResolvedLabelChange {
  readonly label: Label;
  readonly change: LabelChange;
}

export const resolveLabelChanges = async (
  labels: LabelRepository,
  userId: UserId,
  changes: readonly LabelChange[],
): Promise<ResolvedLabelChange[]> => {
  const resolved: ResolvedLabelChange[] = [];
  for (const change of changes) {
    const label = await labels.findById(userId, change.labelId);
    if (label !== null) {
      resolved.push({ label, change });
    }
  }
  return resolved;
};

export const writeLabelChanges = async (
  repositories: Repositories,
  accountId: AccountId,
  changes: readonly ResolvedLabelChange[],
  now: string,
): Promise<PendingProviderOp[]> => {
  const recorded: PendingProviderOp[] = [];
  for (const { label, change } of changes) {
    for (const messageId of change.messageIds) {
      await (change.value
        ? repositories.messages.addLabel(messageId, label.id)
        : repositories.messages.removeLabel(messageId, label.id));
    }
    const ops = change.providerMessageIds.map((messageId) => ({
      messageId,
      change: { kind: 'label', label: label.remoteName, value: change.value } as const,
    }));
    recorded.push(...(await recordProviderOps(repositories.pendingWork, accountId, ops, now)));
  }
  return recorded;
};
