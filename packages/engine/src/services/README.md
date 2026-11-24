# Planned application services

Services live here, one use-case family per file (split further when a file grows past ~150 lines). They depend only on ports from `../ports` and contracts from `@relay/shared`, never on infrastructure. Every service receives its collaborators through the constructor, so the server (Nest providers bound via `PORT_TOKENS`) and the desktop main process (`apps/desktop/src/main/composition`) wire the same classes to different adapters.

Shared rules:

- Every user-facing method takes the acting `UserId` first and only touches rows owned by that user.
- Writes that must be atomic go through `UnitOfWork.run` and use the transaction-bound `Repositories` it passes in.
- After a state change, publish the matching `RealtimeEvent` through `EventPublisher` (server: WS gateway; local: IPC `local.events` stream).
- Failures are reported with the error classes from `../errors` (`NotFoundError`, `ValidationError`, `ProviderError`, ...). Adapters map `EngineError.code` to `ApiErrorBody`.
- Time comes from `Clock`, ids from `IdGenerator`. No `Date.now()` or random ids inside services.

### `SyncService`

Sync one account: refresh mailboxes and roles, fetch new messages since the stored cursor (UIDVALIDITY / last UID / HIGHESTMODSEQ), apply flag changes and expunges, parse, thread, classify Jira, match splits, upsert messages and thread summaries, keep IDLE running, report `sync.progress` and `account.status`.

Ports: `AccountRepository`, `MailboxRepository`, `MessageRepository`, `ThreadRepository`, `LabelRepository`, `SplitRepository`, `TaskRepository`, `SyncStateRepository`, `UnitOfWork`, `MailProviderFactory`, `CredentialVault`, `MessageParser`, `ThreadResolver`, `JiraClassifier`, `SplitMatcher`, `EventPublisher`, `Clock`, `IdGenerator`, `Logger`

### `InboxQueryService`

Folder views (`FolderView`) with cursor pagination, unified (all accounts) or per-account, filtered by split, label or search text.

Ports: `ThreadRepository`, `SplitRepository`, `AccountRepository`

### `ThreadQueryService`

Thread detail: messages, latest AI summary + checklist + reply suggestions; marks the thread read when opened if requested.

Ports: `ThreadRepository`, `MessageRepository`, `AiResultRepository`, `DraftRepository`

### `MessageActionsService`

`ThreadAction` commands: done (mark complete and archive), archive, undone, trash, restore, read/unread, add/remove label. Updates local state first, mirrors the change to the provider (move / flags / keywords), publishes `thread.upserted`.

Ports: `ThreadRepository`, `MessageRepository`, `MailboxRepository`, `LabelRepository`, `AccountRepository`, `UnitOfWork`, `MailProviderFactory`, `CredentialVault`, `EventPublisher`, `Clock`

### `ReminderService`

Schedule and cancel reminders (`remind` / `cancelReminder`), fire due reminders: move the thread back to the inbox, mark the reminder fired, publish the update.

Ports: `ReminderRepository`, `ThreadRepository`, `UnitOfWork`, `EventPublisher`, `Clock`, `IdGenerator`

### `ComposeService`

Draft CRUD, attachment upload, immediate send (SMTP + append to Sent + thread linkage), scheduled send creation / cancellation, sending due scheduled sends.

Ports: `DraftRepository`, `AttachmentStore`, `ScheduledSendRepository`, `AccountRepository`, `MailboxRepository`, `MessageRepository`, `ThreadRepository`, `MailSender`, `MailProviderFactory`, `CredentialVault`, `UnitOfWork`, `EventPublisher`, `Clock`, `IdGenerator`

### `TaskService`

Task list and updates; create or update tasks from Jira classifications (one task per Jira key) and from AI output; publish `task.upserted`.

Ports: `TaskRepository`, `ThreadRepository`, `EventPublisher`, `Clock`, `IdGenerator`

### `TaskSystemService`

Connections to external task systems (Jira Cloud today): connect verifies the credentials through the provider's adapter before anything is stored, list, disconnect (secret first, then the row) and the live list of the user's open tickets; a rejected token marks the connection `error`; publishes `taskSystems.updated`.

Ports: `TaskSystemConnectionRepository`, `TaskSystemAdapterRegistry`, `TaskSystemSecretStore`, `EventPublisher`, `Clock`, `IdGenerator`

### `SplitService`

List and replace splits (validating regex rules), re-evaluate split membership for existing threads after a change.

Ports: `SplitRepository`, `ThreadRepository`, `MessageRepository` (`listMatchSubjects` returns the stored from / to / cc / subject / headers and whether the message has a file attachment), `SplitMatcher`, `UnitOfWork`, `IdGenerator`

### `AiService`

Create AI jobs, pick the runner (user settings + availability), run them, persist `AiResult`s (one-liner onto the thread summary), publish `ai.job.updated`, respect feature toggles.

Ports: `AiJobRepository`, `AiResultRepository`, `ThreadRepository`, `MessageRepository`, `SettingsRepository`, `AiRunnerRegistry`, `EventPublisher`, `Clock`, `IdGenerator`, `Logger`

User settings (`GET/PATCH /settings`) are small enough to live in a `SettingsService` next to these (`SettingsRepository`, `EventPublisher`) that applies a `UserSettingsPatch` on top of `DEFAULT_USER_SETTINGS`.
