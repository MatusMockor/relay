import type { MailboxRole } from '@relay/shared/domain';
import type { MailCopies } from '../../shared/mail-copies';
import { copiesIn, receivedIn, rolesAfter } from './physical-messages';
import {
  type LocatedMessage,
  moveTo,
  originsOf,
  plan,
  returnTo,
  settledState,
  type StateMovePlanner,
} from './state-move-plan';

const RESTORE_TARGETS: readonly MailboxRole[] = ['inbox', 'archive', 'sent', 'spam', 'custom'];
const TRASH_SOURCES: readonly MailboxRole[] = ['inbox', 'archive', 'spam', 'custom'];

const trashSources = (
  messages: readonly LocatedMessage[],
  copies: MailCopies,
): LocatedMessage[] => {
  const received = receivedIn(copies, messages, TRASH_SOURCES);
  return received.length > 0 ? received : copiesIn(copies, messages, ['sent']);
};

export const trash: StateMovePlanner = (messages, thread, copies) => {
  if (thread.state === 'trash') {
    return plan('trash');
  }
  const sources = trashSources(messages, copies);
  return {
    ...moveTo('trash', sources, 'trash'),
    origins: [{ kind: 'trash-origin', remember: originsOf(sources), forget: [] }],
  };
};

export const restore: StateMovePlanner = (messages, _thread, copies) => {
  const moves = copiesIn(copies, messages, ['trash']).map(({ message, origin }) => ({
    messageId: message.id,
    ...returnTo(origin, RESTORE_TARGETS),
  }));
  return {
    ...plan(settledState(rolesAfter(copies, messages, moves)), moves),
    origins: [{ kind: 'trash-origin', remember: [], forget: moves.map((move) => move.messageId) }],
  };
};
