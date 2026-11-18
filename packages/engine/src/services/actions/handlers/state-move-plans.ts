import type { ThreadSummary } from '@relay/shared/domain';
import type { MailCopies } from '../../shared/mail-copies';
import { outsideHeld } from './held-guard';
import { notSpam, reportSpam } from './spam-plans';
import {
  inRoles,
  type LocatedMessage,
  moveTo,
  type StateMoveAction,
  type StateMovePlan,
  type StateMovePlanner,
} from './state-move-plan';
import { restore, trash } from './trash-plans';

const PLANNERS: Readonly<Record<StateMoveAction, StateMovePlanner>> = {
  done: outsideHeld((messages) => moveTo('done', inRoles(messages, ['inbox']), 'archive')),
  undone: outsideHeld((messages) =>
    moveTo('inbox', inRoles(messages, ['archive', 'custom']), 'inbox'),
  ),
  trash,
  restore,
  reportSpam,
  notSpam,
};

export const planStateMove = (
  action: StateMoveAction,
  messages: readonly LocatedMessage[],
  thread: ThreadSummary,
  copies: MailCopies,
): StateMovePlan => PLANNERS[action](messages, thread, copies);
