import type { LabelId, MailboxRole, ThreadState } from '@relay/shared/domain';
import type { MailCopies } from '../../shared/mail-copies';
import type { MoveOrigin } from '../../shared/move-origins';
import { isAt, physicalKeyOf } from './folder-move-plans';
import { labelChange } from './gmail-move-plans';
import { rolesAfter } from './physical-messages';
import {
  type LabelChange,
  type LocatedMessage,
  type MoveTarget,
  type OriginChanges,
  type PlannedMove,
  plan,
  settledState,
  type StateMovePlanner,
} from './state-move-plan';

const targetOf = (origin: MoveOrigin): MoveTarget =>
  origin.mailboxId === undefined
    ? { role: origin.role }
    : { role: origin.role, mailboxId: origin.mailboxId };

const returnMoves = (recorded: readonly LocatedMessage[]): PlannedMove[] =>
  recorded.flatMap((located) => {
    const target = located.moveOrigin === undefined ? null : targetOf(located.moveOrigin);
    if (target === null || isAt(located, target)) {
      return [];
    }
    return [{ messageId: located.message.id, ...target }];
  });

const labelRemovals = (copies: MailCopies, recorded: readonly LocatedMessage[]): LabelChange[] => {
  const added = new Set<LabelId>(
    recorded.flatMap(({ moveOrigin }) =>
      moveOrigin?.labelId === undefined ? [] : [moveOrigin.labelId],
    ),
  );
  return [...added].flatMap((labelId) =>
    labelChange(
      copies,
      labelId,
      false,
      recorded.filter(
        ({ message, moveOrigin }) =>
          moveOrigin?.labelId === labelId && message.labelIds.includes(labelId),
      ),
    ),
  );
};

const HELD_KINDS = ['trash-origin', 'spam-origin'] as const;

const heldOrigins = (recorded: readonly LocatedMessage[]): OriginChanges[] =>
  HELD_KINDS.map((kind) => ({
    kind,
    remember: recorded.flatMap(({ message, moveOrigin }) =>
      (moveOrigin?.held ?? [])
        .filter((held) => held.kind === kind)
        .map((held) =>
          held.mailboxId === undefined
            ? { messageId: message.id, role: held.role }
            : { messageId: message.id, role: held.role, mailboxId: held.mailboxId },
        ),
    ),
    forget: [],
  }));

const returnedState = (roles: readonly (MailboxRole | undefined)[]): ThreadState => {
  const placed = roles.filter((role) => role !== 'sent');
  if (placed.length > 0 && placed.every((role) => role === 'trash')) {
    return 'trash';
  }
  return settledState(roles);
};

export const undoMove: StateMovePlanner = (messages, thread, copies) => {
  const recorded = messages.filter(({ moveOrigin }) => moveOrigin !== undefined);
  if (recorded.length === 0) {
    return plan(thread.state);
  }
  const moves = returnMoves(recorded);
  return {
    ...plan(
      returnedState(
        rolesAfter(copies, messages, moves, (message) => physicalKeyOf(copies, message)),
      ),
      moves,
    ),
    origins: [
      {
        kind: 'move-origin',
        remember: [],
        forget: recorded.map(({ message }) => message.id),
      },
      ...heldOrigins(recorded),
    ],
    labels: labelRemovals(copies, recorded),
  };
};
