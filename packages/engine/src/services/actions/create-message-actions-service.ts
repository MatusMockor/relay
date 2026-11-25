import type { EngineDeps } from '../../engine-deps';
import type { ReminderScheduler } from '../reminders/reminder-service';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import { MailboxEvents } from '../sync/mailbox-events';
import { FolderReadService, type FolderThreadLister } from './folder-read-service';
import { FlagWriter } from './handlers/flag-writer';
import { LabelHandler } from './handlers/label-handler';
import { MessageLocator } from './handlers/message-locator';
import { MoveHandler } from './handlers/move-handler';
import { PinHandler } from './handlers/pin-handler';
import { ReadStateHandler } from './handlers/read-state-handler';
import { StateMoveHandler } from './handlers/state-move-handler';
import { MessageActionsService } from './message-actions-service';
import { ProviderMirror } from './provider-mirror';
import type { ProviderOpReplayer } from './provider-op-replayer';

export const DEFAULT_FOLDER_READ_PAGE_SIZE = 200;

export interface MessageActionComponents {
  readonly actions: MessageActionsService;
  readonly folderRead: FolderReadService;
  readonly mirror: ProviderMirror;
}

export const createMessageActionComponents = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly reminders: ReminderScheduler;
    readonly replayer: ProviderOpReplayer;
    readonly folders: FolderThreadLister;
  },
): MessageActionComponents => {
  const { repositories, unitOfWork, logger, clock } = deps;
  const mirror = new ProviderMirror({
    sessions: shared.sessions,
    replayer: shared.replayer,
    logger,
  });
  const mailboxEvents = new MailboxEvents({
    mailboxes: repositories.mailboxes,
    labels: repositories.labels,
    events: shared.events,
  });
  const flags = new FlagWriter({ unitOfWork, mirror, clock, mailboxEvents });
  const locator = new MessageLocator(repositories.mailboxes, repositories.pendingWork);
  const stateMoves = new StateMoveHandler({
    locator,
    labels: repositories.labels,
    unitOfWork,
    mirror,
    clock,
  });
  const actions = new MessageActionsService({
    threads: repositories.threads,
    messages: repositories.messages,
    accounts: repositories.accounts,
    stateMoves,
    moves: new MoveHandler({
      mailboxes: repositories.mailboxes,
      labels: repositories.labels,
      pendingWork: repositories.pendingWork,
      stateMoves,
      clock,
    }),
    readState: new ReadStateHandler(flags),
    pins: new PinHandler(flags),
    labels: new LabelHandler({
      labels: repositories.labels,
      locator,
      unitOfWork,
      mirror,
      clock,
    }),
    reminders: shared.reminders,
    events: shared.events,
  });
  const folderRead = new FolderReadService({
    folders: shared.folders,
    accounts: repositories.accounts,
    unitOfWork,
    flags,
    mirror,
    events: shared.events,
    pageSize: deps.options.actions?.folderReadPageSize ?? DEFAULT_FOLDER_READ_PAGE_SIZE,
  });
  return { actions, folderRead, mirror };
};
