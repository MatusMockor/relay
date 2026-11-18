import type { AccountId, Label, Message } from '@relay/shared/domain';
import type { Repositories } from '../../../ports/repositories';
import { MailCopies } from '../../shared/mail-copies';
import { type PendingProviderOp, recordProviderOps } from '../../shared/provider-ops';
import type { ThreadActionContext } from '../thread-action-context';
import { labelChange } from './gmail-move-plans';
import { writeLabelChanges } from './label-change-writer';
import type { MessageLocator } from './message-locator';
import { dropSupersededLabelOps } from './superseded-label-ops';

export type LabelWrite = (
  repositories: Repositories,
  accountId: AccountId,
  now: string,
) => Promise<PendingProviderOp[]>;

export const keywordWrite =
  (label: Label, add: boolean, targets: readonly Message[]): LabelWrite =>
  async (repositories, accountId, now) => {
    for (const message of targets) {
      await (add
        ? repositories.messages.addLabel(message.id, label.id)
        : repositories.messages.removeLabel(message.id, label.id));
    }
    return recordProviderOps(
      repositories.pendingWork,
      accountId,
      targets.map((message) => ({
        messageId: message.id,
        change: { kind: 'keyword', keyword: label.remoteName, value: add } as const,
      })),
      now,
    );
  };

export const gmailWrite = async (
  locator: MessageLocator,
  context: ThreadActionContext,
  label: Label,
  add: boolean,
  targets: readonly Message[],
): Promise<LabelWrite> => {
  const ids = new Set(targets.map((message) => message.id));
  const located = (await locator.locate(context)).filter(({ message }) => ids.has(message.id));
  const copies = MailCopies.of(context.account);
  const changes = labelChange(copies, label.id, add, located).map((change) => ({ label, change }));
  return async (repositories, accountId, now) => {
    await dropSupersededLabelOps(
      repositories.pendingWork,
      accountId,
      copies,
      context.messages,
      changes,
    );
    return writeLabelChanges(repositories, accountId, changes, now);
  };
};
