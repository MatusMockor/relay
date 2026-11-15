import type { EngineDeps } from '../../engine-deps';
import type { ReminderScheduler } from '../reminders/reminder-service';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import { LabelHandler } from './handlers/label-handler';
import { ReadStateHandler } from './handlers/read-state-handler';
import { StateMoveHandler } from './handlers/state-move-handler';
import { MessageActionsService } from './message-actions-service';
import { ProviderMirror } from './provider-mirror';

export const createMessageActionsService = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly reminders: ReminderScheduler;
    readonly roleMailboxes: RoleMailboxEnsurer;
  },
): MessageActionsService => {
  const { repositories, unitOfWork, logger } = deps;
  const mirror = new ProviderMirror({
    mailboxes: repositories.mailboxes,
    sessions: shared.sessions,
    logger,
  });
  return new MessageActionsService({
    threads: repositories.threads,
    messages: repositories.messages,
    accounts: repositories.accounts,
    stateMoves: new StateMoveHandler({
      threads: repositories.threads,
      messages: repositories.messages,
      mailboxes: repositories.mailboxes,
      mirror,
      roleMailboxes: shared.roleMailboxes,
      logger,
    }),
    readState: new ReadStateHandler({ unitOfWork, mirror }),
    labels: new LabelHandler({ labels: repositories.labels, unitOfWork, mirror }),
    reminders: shared.reminders,
    events: shared.events,
  });
};
