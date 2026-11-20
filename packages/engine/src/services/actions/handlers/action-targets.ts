import type { LabelId, Message } from '@relay/shared/domain';
import { byDateAscending } from '../../shared/dates';

export const unreadTargets = (messages: readonly Message[]): Message[] =>
  messages.filter((message) => !message.flags.seen);

export const pinTargets = (messages: readonly Message[]): Message[] => {
  const latest = [...messages].sort(byDateAscending).at(-1);
  return latest === undefined || latest.flags.flagged ? [] : [latest];
};

export const labelTargets = (
  messages: readonly Message[],
  labelId: LabelId,
  add: boolean,
): Message[] => messages.filter((message) => message.labelIds.includes(labelId) !== add);
