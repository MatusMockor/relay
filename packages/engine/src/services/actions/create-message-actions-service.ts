import type { EngineDeps } from '../../engine-deps';
import type { ReminderScheduler } from '../reminders/reminder-service';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import { FlagWriter } from './handlers/flag-writer';
import { LabelHandler } from './handlers/label-handler';
import { PinHandler } from './handlers/pin-handler';
import { ReadStateHandler } from './handlers/read-state-handler';
import { StateMoveHandler } from './handlers/state-move-handler';
import { MessageActionsService } from './message-actions-service';
import { ProviderMirror } from './provider-mirror';
import type { ProviderOpReplayer } from './provider-op-replayer';

export const createMessageActionsService = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly reminders: ReminderScheduler;
    readonly replayer: ProviderOpReplayer;
  },
): MessageActionsService => {
  const { repositories, unitOfWork, logger, clock } = deps;
  const mirror = new ProviderMirror({
    sessions: shared.sessions,
    replayer: shared.replayer,
    logger,
  });
  const flags = new FlagWriter({ unitOfWork, mirror, clock });
  return new MessageActionsService({
    threads: repositories.threads,
    messages: repositories.messages,
    accounts: repositories.accounts,
    stateMoves: new StateMoveHandler({
      mailboxes: repositories.mailboxes,
      pendingWork: repositories.pendingWork,
      unitOfWork,
      mirror,
      clock,
    }),
    readState: new ReadStateHandler(flags),
    pins: new PinHandler(flags),
    labels: new LabelHandler({ labels: repositories.labels, unitOfWork, mirror, clock }),
    reminders: shared.reminders,
    events: shared.events,
  });
};
