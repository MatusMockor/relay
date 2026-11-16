import type { EngineDeps } from './engine-deps';
import type { AccountService } from './services/accounts/account-service';
import { createAccountService } from './services/accounts/create-account-service';
import { createMessageActionsService } from './services/actions/create-message-actions-service';
import { ProviderOpReplayer } from './services/actions/provider-op-replayer';
import type { MessageActionsService } from './services/actions/message-actions-service';
import type { AiService } from './services/ai/ai-service';
import type { AttachmentContentService } from './services/attachments/attachment-content-service';
import type { AttachmentSweeper } from './services/attachments/attachment-sweeper';
import { createAttachmentSweeper } from './services/attachments/create-attachment-sweeper';
import { createAttachmentContentService } from './services/attachments/create-attachment-content-service';
import type { CalendarService } from './services/calendar/calendar-service';
import { createCalendarComponents } from './services/calendar/create-calendar-service';
import { createInviteComponents } from './services/calendar/create-invite-components';
import { createAiComponents } from './services/ai/create-ai-service';
import { createGoogleCalendarComponents } from './services/google-calendar/create-google-calendar-service';
import type { GoogleCalendarService } from './services/google-calendar/google-calendar-service';
import type { ComposeService } from './services/compose/compose-service';
import { createComposeService } from './services/compose/create-compose-service';
import { SentMessageRecorder } from './services/compose/sent-message-recorder';
import { InboxQueryService } from './services/inbox/inbox-query-service';
import { LabelQueryService } from './services/inbox/label-query-service';
import { ReminderService } from './services/reminders/reminder-service';
import { SettingsService } from './services/settings/settings-service';
import { EngineEvents } from './services/shared/engine-events';
import { MailProviderSessions } from './services/shared/mail-provider-sessions';
import { RoleMailboxEnsurer } from './services/shared/role-mailbox-ensurer';
import {
  DEFAULT_USER_SETTINGS_POLICY,
  UserSettingsReader,
} from './services/shared/user-settings-reader';
import { SplitMembershipEvaluator } from './services/splits/split-membership-evaluator';
import { PERMISSIVE_PATTERN_POLICY } from './services/splits/split-rule-validator';
import { SplitService } from './services/splits/split-service';
import { createSyncComponents } from './services/sync/create-sync-service';
import type { SyncService } from './services/sync/sync-service';
import { TaskService } from './services/tasks/task-service';
import { ThreadAiPreparer } from './services/threads/thread-ai-preparer';
import { ThreadChecklistService } from './services/threads/thread-checklist-service';
import { ThreadQueryService } from './services/threads/thread-query-service';

export interface EngineServices {
  readonly accounts: AccountService;
  readonly settings: SettingsService;
  readonly inbox: InboxQueryService;
  readonly labels: LabelQueryService;
  readonly threads: ThreadQueryService;
  readonly threadAi: ThreadAiPreparer;
  readonly checklist: ThreadChecklistService;
  readonly actions: MessageActionsService;
  readonly reminders: ReminderService;
  readonly tasks: TaskService;
  readonly sync: SyncService;
  readonly compose: ComposeService;
  readonly attachments: AttachmentContentService;
  readonly attachmentSweeper: AttachmentSweeper;
  readonly splits: SplitService;
  readonly ai: AiService;
  readonly calendar: CalendarService;
  readonly googleCalendar: GoogleCalendarService;
}

export const createEngineServices = (deps: EngineDeps): EngineServices => {
  const { repositories, unitOfWork, clock, idGenerator: ids } = deps;
  const events = new EngineEvents(deps.eventPublisher, clock);
  const sessions = new MailProviderSessions(deps.mailProviderFactory, deps.credentialVault);
  const userSettings = new UserSettingsReader(repositories.settings, {
    defaults: deps.options.settings?.defaults ?? DEFAULT_USER_SETTINGS_POLICY.defaults,
    pinnedAiLocation: deps.options.settings?.pinnedAiLocation ?? null,
  });
  const roleMailboxes = new RoleMailboxEnsurer({
    mailboxes: repositories.mailboxes,
    ids,
    logger: deps.logger,
  });
  const reminders = new ReminderService({
    reminders: repositories.reminders,
    threads: repositories.threads,
    unitOfWork,
    events,
    clock,
    ids,
  });
  const tasks = new TaskService({
    tasks: repositories.tasks,
    threads: repositories.threads,
    events,
    clock,
    ids,
  });
  const replayer = new ProviderOpReplayer({
    messages: repositories.messages,
    mailboxes: repositories.mailboxes,
    pendingWork: repositories.pendingWork,
    roleMailboxes,
    logger: deps.logger,
  });
  const actions = createMessageActionsService(deps, {
    events,
    sessions,
    reminders,
    replayer,
  });
  const threads = new ThreadQueryService({
    threads: repositories.threads,
    messages: repositories.messages,
    aiResults: repositories.aiResults,
    readMarker: actions,
  });
  const ai = createAiComponents(deps, { events, threads, settings: userSettings });
  const invites = createInviteComponents(deps, events);
  const sync = createSyncComponents(deps, {
    calendarParts: invites.sink,
    backfill: invites.backfill,
    events,
    sessions,
    tasks,
    arrivals: ai.oneLiners,
    replayer,
  });
  const google = createGoogleCalendarComponents(deps, events);
  const calendar = createCalendarComponents(
    deps,
    events,
    new SentMessageRecorder({
      roleMailboxes,
      splits: repositories.splits,
      sessions,
      ingestor: sync.ingestor,
      unitOfWork,
      events,
      clock,
      logger: deps.logger,
    }),
    google.inviteRsvp,
  );
  const attachments = createAttachmentContentService(deps, sessions);
  const attachmentSweeper = createAttachmentSweeper(deps);
  return {
    accounts: createAccountService(deps, { events, attachmentSweeper }),
    settings: new SettingsService({
      settings: repositories.settings,
      reader: userSettings,
      relocator: ai.relocator,
      events,
    }),
    inbox: new InboxQueryService({
      threads: repositories.threads,
      splits: repositories.splits,
      accounts: repositories.accounts,
    }),
    labels: new LabelQueryService(repositories.labels),
    threads,
    threadAi: new ThreadAiPreparer({
      threads: repositories.threads,
      messages: repositories.messages,
      accounts: repositories.accounts,
      aiResults: repositories.aiResults,
      creator: ai.service,
      settings: userSettings,
      logger: deps.logger,
    }),
    checklist: new ThreadChecklistService({
      threads: repositories.threads,
      aiResults: repositories.aiResults,
    }),
    actions,
    reminders,
    tasks,
    sync: sync.service,
    compose: createComposeService(deps, {
      events,
      sessions,
      ingestor: sync.ingestor,
      roleMailboxes,
      attachmentContent: attachments,
      attachmentSweeper,
    }),
    attachments,
    attachmentSweeper,
    splits: new SplitService({
      splits: repositories.splits,
      accounts: repositories.accounts,
      evaluator: new SplitMembershipEvaluator({
        splits: repositories.splits,
        messages: repositories.messages,
        threads: repositories.threads,
        matcher: deps.splitMatcher,
        unitOfWork,
      }),
      events,
      ids,
      patterns: deps.splitPatternPolicy ?? PERMISSIVE_PATTERN_POLICY,
    }),
    ai: ai.service,
    calendar,
    googleCalendar: google.service,
  };
};
