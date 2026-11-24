import { isPendingPlacement, type LabelId, type MessageId } from '@relay/shared/domain';
import type { MoveOriginWork } from '../../../model/pending-work';
import type { MailCopies } from '../../shared/mail-copies';
import { folderSources, movedPlan, placementOf } from './folder-move-plans';
import { firstPerMessage, uniqueMessageIds } from './located-ids';
import {
  type LabelChange,
  type LocatedMessage,
  type MoveTarget,
  plan,
  type StateMovePlanner,
} from './state-move-plan';

const ALL_MAIL: MoveTarget = { role: 'archive' };

const carrierRank = (located: LocatedMessage): number => {
  if (isPendingPlacement(located.placement)) {
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
    const key = copies.logicalKeyOf(located.message);
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
      messageIds: uniqueMessageIds(messages),
      providerMessageIds: labelCarriers(copies, messages),
    },
  ];
};

const labelledKeys = (
  copies: MailCopies,
  labelId: LabelId,
  messages: readonly LocatedMessage[],
): Set<string> =>
  new Set(
    messages
      .filter(({ message }) => message.labelIds.includes(labelId))
      .map(({ message }) => copies.logicalKeyOf(message)),
  );

const addedLabel = (
  copies: MailCopies,
  labelId: LabelId,
  unlabelled: readonly LocatedMessage[],
  owned: readonly LocatedMessage[],
): LabelChange[] => {
  if (unlabelled.length === 0) {
    return [];
  }
  return [
    {
      labelId,
      value: true,
      messageIds: uniqueMessageIds(unlabelled),
      providerMessageIds: labelCarriers(copies, owned),
    },
  ];
};

const recordedOrigins = (
  messages: readonly LocatedMessage[],
  sources: readonly LocatedMessage[],
  added: ReadonlySet<MessageId>,
  labelId: LabelId,
): MoveOriginWork[] => {
  const moved = new Map(sources.map((source) => [source.message.id, source]));
  return firstPerMessage(
    messages.filter(({ message }) => moved.has(message.id) || added.has(message.id)),
  ).flatMap((located) => {
    const source = moved.get(located.message.id);
    return placementOf(
      source ?? { ...located, heldOrigins: [] },
      added.has(located.message.id) ? labelId : undefined,
    );
  });
};

export const gmailMove =
  (labelId: LabelId): StateMovePlanner =>
  (messages, thread, copies) => {
    const sources = folderSources(messages, copies, ALL_MAIL);
    const unlabelled = messages.filter(({ message }) => !message.labelIds.includes(labelId));
    if (sources.length === 0 && unlabelled.length === 0) {
      return plan(thread.state);
    }
    const labelled = labelledKeys(copies, labelId, messages);
    const owned = unlabelled.filter(({ message }) => !labelled.has(copies.logicalKeyOf(message)));
    const added = new Set(owned.map(({ message }) => message.id));
    return movedPlan(messages, {
      state: 'done',
      target: ALL_MAIL,
      sources,
      remember: recordedOrigins(messages, sources, added, labelId),
      labels: addedLabel(copies, labelId, unlabelled, owned),
    });
  };
