import type { LabelId, MailboxRole, Message, ThreadState } from '@relay/shared/domain';
import type { MoveOriginWork } from '../../../model/pending-work';
import type { MailCopies } from '../../shared/mail-copies';
import { uniqueMessageIds } from './located-ids';
import { receivedIn } from './physical-messages';
import {
  type LabelChange,
  type LocatedMessage,
  type MoveTarget,
  plan,
  sourceUidOf,
  type StateMovePlan,
  type StateMovePlanner,
} from './state-move-plan';

const MOVABLE_ROLES: readonly MailboxRole[] = ['inbox', 'archive', 'custom', 'spam', 'trash'];

export const isAt = (located: LocatedMessage, target: MoveTarget): boolean =>
  target.mailboxId === undefined
    ? located.role === target.role
    : located.mailboxId === target.mailboxId;

export const physicalKeyOf = (copies: MailCopies, message: Message): string =>
  message.emailId ?? copies.identityOf(message);

export const placementOf = (located: LocatedMessage, labelId?: LabelId): MoveOriginWork[] => {
  const { message, role, mailboxId } = located;
  if (role === undefined) {
    return [];
  }
  const held = located.heldOrigins ?? [];
  return [
    {
      messageId: message.id,
      role,
      ...(mailboxId === undefined ? {} : { mailboxId }),
      ...sourceUidOf(located),
      ...(labelId === undefined ? {} : { labelId }),
      ...(held.length === 0 ? {} : { held }),
    },
  ];
};

const physicalGroups = (
  copies: MailCopies,
  messages: readonly LocatedMessage[],
): LocatedMessage[][] => {
  const groups = new Map<string, LocatedMessage[]>();
  for (const located of messages) {
    const key = physicalKeyOf(copies, located.message);
    groups.set(key, [...(groups.get(key) ?? []), located]);
  }
  return [...groups.values()];
};

export const folderSources = (
  messages: readonly LocatedMessage[],
  copies: MailCopies,
  target: MoveTarget,
): LocatedMessage[] =>
  physicalGroups(copies, messages)
    .flatMap((group) => receivedIn(copies, group, MOVABLE_ROLES))
    .filter((source) => !isAt(source, target));

export interface MovedThread {
  readonly state: ThreadState;
  readonly target: MoveTarget;
  readonly sources: readonly LocatedMessage[];
  readonly remember: readonly MoveOriginWork[];
  readonly labels: readonly LabelChange[];
}

export const movedPlan = (
  messages: readonly LocatedMessage[],
  moved: MovedThread,
): StateMovePlan => {
  const movedIds = uniqueMessageIds(moved.sources);
  return {
    ...plan(
      moved.state,
      moved.sources.map(({ message, placement }) => ({
        messageId: message.id,
        source: placement,
        ...moved.target,
      })),
    ),
    origins: [
      {
        kind: 'move-origin',
        remember: moved.remember,
        forget: uniqueMessageIds(messages),
      },
      { kind: 'trash-origin', remember: [], forget: movedIds },
      { kind: 'spam-origin', remember: [], forget: movedIds },
    ],
    labels: moved.labels,
  };
};

export const folderMove =
  (target: MoveTarget): StateMovePlanner =>
  (messages, thread, copies) => {
    const sources = folderSources(messages, copies, target);
    if (sources.length === 0) {
      return plan(thread.state);
    }
    return movedPlan(messages, {
      state: target.role === 'inbox' ? 'inbox' : 'done',
      target,
      sources,
      remember: sources.flatMap((source) => placementOf(source)),
      labels: [],
    });
  };
