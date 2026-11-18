import type { LabelId, MessageId } from '@relay/shared/domain';
import type { MailCopies } from '../../shared/mail-copies';
import { PENDING_UID } from '../../shared/pending-uid';
import { folderSources, movedPlan, placementOf } from './folder-move-plans';
import {
  type LabelChange,
  type LocatedMessage,
  type MoveTarget,
  plan,
  type StateMovePlanner,
} from './state-move-plan';

const ALL_MAIL: MoveTarget = { role: 'archive' };

const carrierRank = (located: LocatedMessage): number => {
  if (located.message.uid === PENDING_UID) {
    return 2;
  }
  return located.role === 'archive' ? 0 : 1;
};

export const labelCarriers = (
  copies: MailCopies,
  messages: readonly LocatedMessage[],
): MessageId[] => {
  const chosen = new Map<string, LocatedMessage>();
  for (const located of messages) {
    const key = located.message.emailId ?? copies.identityOf(located.message);
    const current = chosen.get(key);
    if (current === undefined || carrierRank(located) < carrierRank(current)) {
      chosen.set(key, located);
    }
  }
  return [...chosen.values()].map(({ message }) => message.id);
};

export const labelChange = (
  copies: MailCopies,
  labelId: LabelId,
  value: boolean,
  messages: readonly LocatedMessage[],
): LabelChange[] => {
  if (messages.length === 0) {
    return [];
  }
  return [
    {
      labelId,
      value,
      messageIds: messages.map(({ message }) => message.id),
      providerMessageIds: labelCarriers(copies, messages),
    },
  ];
};

export const gmailMove =
  (labelId: LabelId): StateMovePlanner =>
  (messages, thread, copies) => {
    const sources = folderSources(messages, copies, ALL_MAIL);
    const unlabelled = messages.filter(({ message }) => !message.labelIds.includes(labelId));
    if (sources.length === 0 && unlabelled.length === 0) {
      return plan(thread.state);
    }
    const added = new Set(unlabelled.map(({ message }) => message.id));
    const moved = new Set(sources.map(({ message }) => message.id));
    const recorded = messages.filter(
      ({ message }) => moved.has(message.id) || added.has(message.id),
    );
    return movedPlan(messages, {
      state: 'done',
      target: ALL_MAIL,
      sources,
      remember: recorded.flatMap((located) =>
        placementOf(located, added.has(located.message.id) ? labelId : undefined),
      ),
      labels: labelChange(copies, labelId, true, unlabelled),
    });
  };
