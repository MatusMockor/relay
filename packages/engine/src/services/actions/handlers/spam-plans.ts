import type { MailboxRole } from '@relay/shared/domain';
import { ValidationError } from '../../../errors';
import { copiesIn, receivedIn, rolesAfter } from './physical-messages';
import {
  moveTo,
  originsOf,
  plan,
  returnTo,
  settledState,
  type StateMovePlanner,
} from './state-move-plan';

const REPORTABLE_ROLES: readonly MailboxRole[] = ['inbox', 'archive'];

export const reportSpam: StateMovePlanner = (messages, thread, copies) => {
  if (thread.state === 'spam') {
    return plan('spam');
  }
  const sources = receivedIn(copies, messages, REPORTABLE_ROLES);
  if (sources.length === 0) {
    throw new ValidationError(
      'V konverzácii nie je prijatá správa, ktorú by šlo nahlásiť ako spam.',
    );
  }
  return {
    ...moveTo('spam', sources, 'spam'),
    origins: { kind: 'spam-origin', remember: originsOf(sources), forget: [] },
  };
};

export const notSpam: StateMovePlanner = (messages, thread, copies) => {
  const moves = copiesIn(copies, messages, ['spam']).map(({ message, origin }) => ({
    messageId: message.id,
    role: returnTo(origin, REPORTABLE_ROLES),
  }));
  if (moves.length === 0 && thread.state !== 'spam') {
    return plan(thread.state);
  }
  return {
    ...plan(settledState(rolesAfter(copies, messages, moves)), moves),
    origins: { kind: 'spam-origin', remember: [], forget: moves.map((move) => move.messageId) },
  };
};
