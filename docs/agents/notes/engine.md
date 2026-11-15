# engine agent note

Owner of `packages/engine/**`.

## Status

DONE. All services implemented, `pnpm --filter @relay/engine lint`, `typecheck` and `test` green (13 test files, 66 tests). A gpt-6.1-sol review and a re-check of the fixes were run, valid findings fixed (see "Review" below).

- [x] InboxQueryService, LabelQueryService, ThreadQueryService
- [x] MessageActionsService
- [x] SyncService
- [x] ComposeService (DraftService + SendService + ScheduledSendService behind a facade)
- [x] ReminderService
- [x] TaskService
- [x] SplitService
- [x] AiService
- [x] AccountService
- [x] SettingsService
- [x] `createEngineServices(deps)`

## Ready for others

`createEngineServices(deps: EngineDeps): EngineServices` from `@relay/engine`.

```ts
interface EngineDeps {
  repositories: Repositories;
  unitOfWork: UnitOfWork;
  mailProviderFactory;
  mailSender;
  credentialVault;
  attachmentStore;
  messageParser;
  threadResolver;
  jiraClassifier;
  splitMatcher;
  aiRunnerRegistry;
  eventPublisher;
  clock;
  idGenerator;
  logger;
  splitPatternPolicy?: SplitPatternPolicy; // e.g. { isUnsafe: isUnsafeRegex } from @relay/mail-core
  options: {
    aiRunnerLocation: 'server' | 'local'; // where THIS process runs AI jobs
    sync?: Partial<SyncOptions>; // initialWindowDays 30, initialMessageLimit 500 per mailbox,
    // mailboxRoles ['inbox','sent','archive','trash'], batchSize 50
    ai?: {
      timeoutMs?: number; // default 120000
      mailTools?:
        | AiMailToolsEndpoint
        | null
        | ((job: AiJob) => Promise<AiMailToolsEndpoint | null>);
      queueInMemory?: boolean; // default true; server with pg-boss passes false
    };
  };
}
```

`EngineServices` (userId always first unless noted):

- `accounts`: `list(userId)`, `require(userId, accountId)`, `mailboxes(userId, accountId)`, `create(userId, CreateAccountBody)` (IMAP; gmail/outlook -> `NotImplementedError`), `createImap(userId, CreateImapAccountBody)`, `createOAuth(userId, { provider, email, credentials: OAuthCredentials, displayName?, color?, isPrimary?, syncIntervalSeconds?, verify? })` (IMAP/SMTP hosts filled per provider, `verify` defaults to false), `update(userId, accountId, UpdateAccountBody)`, `remove(userId, accountId)`, `testConnection(TestConnectionBody): TestConnectionResponse`. Publishes `account.upserted` (also for accounts whose `isPrimary` flipped) and `account.removed`.
- `settings`: `get(userId)` (defaults when nothing stored), `update(userId, UserSettingsPatch)` -> `settings.updated`.
- `inbox.list(userId, ThreadListQuery): ThreadPage`, `labels.list(userId, LabelListQuery)`.
- `threads.getDetail(userId, threadId, { markRead?: boolean }): ThreadDetail`.
- `actions.apply(userId, threadId, ThreadAction): ThreadSummary` -> `thread.upserted`.
- `reminders.schedule(userId, threadId, at)`, `reminders.cancel(userId, threadId)`, `reminders.fireDue(limit = 100)` (ticker / pg-boss).
- `tasks.list(userId, TaskListQuery)`, `tasks.update(userId, taskId, UpdateTaskBody)`, `tasks.createFromAi(userId, { threadId, title, aiWhat })`, `tasks.applyJiraEvent(userId, { threadId, classification, title })`.
- `sync.syncAccount(userId, accountId): SyncReport`, `sync.syncUser(userId)`, `sync.syncAllAccounts()`, `sync.watchAccount(userId, accountId): Disposer`.
- `compose`: `listDrafts`, `createDraft`, `updateDraft`, `deleteDraft`, `uploadAttachment(userId, UploadAttachmentBody)`, `send(userId, SendBody): SendResponse` (a future `scheduledAt` schedules, inline content is stored as a draft first), `listScheduled`, `cancelScheduled` (`ConflictError` when not pending), `sendDueScheduled(limit = 50)` (ticker / pg-boss).
- `splits.list(userId)`, `splits.replace(userId, ReplaceSplitsBody)` (validates regexes, account ownership and ids, publishes `splits.updated`, re-evaluates membership of all existing threads and publishes `thread.upserted` for changed ones), `splits.reevaluate(userId)`.
- `ai`: `createJob(userId, CreateAiJobBody)` (feature toggle -> `ForbiddenError`, runner + location from settings; queued in memory when the job's location equals `aiRunnerLocation` and `queueInMemory`), `getJob`, `listRunners()`, `runJob(userId, jobId, { signal?, onEvent? })` (`ConflictError` for another location or a job that is not queued / already running in this process), `processQueued(limit = 10)`, `run(userId, CreateAiJobBody, signal?): AsyncGenerator<AiEvent, AiJob>` (creates a job for this location and streams runner events, for `ai.run`). Events: `ai.job.updated` for queued / running / done / error.
- `runnerLocation` getter on `ai`.

Ports added on request (additive, nothing existing changed):

- `MessageAttachmentLookup { findByAttachmentId(userId, attachmentId): Promise<Message | null> }` + `PORT_TOKENS.MessageAttachmentLookup` (server-api request). It is NOT part of `Repositories`, so store-sqlite / UnitOfWork are unaffected. server-data can implement it on its message repository class and bind the token.
- `SplitPatternPolicy { isUnsafe(pattern): boolean }` + `PORT_TOKENS.SplitPatternPolicy` (mail-core request). Optional in `EngineDeps`; pass `{ isUnsafe: isUnsafeRegex }` so unsafe patterns are rejected with `ValidationError`.
- `AiMailToolsEndpoint.env?: Readonly<Record<string, string>>` (ai-mcp request; optional so existing literals still compile).

Test infrastructure (reusable patterns): `packages/engine/test/support/` has in-memory repositories (`createMemoryRepositories`, `MemoryUnitOfWork` with snapshot rollback), `FakeMailServer` + `FakeMailProviderFactory` (UIDs, flags, keywords, MODSEQ, UIDVALIDITY reset, expunge, UIDPLUS / CONDSTORE toggles, IDLE listeners), `SimpleMessageParser`, `HeaderThreadResolver`, `RuleSplitMatcher`, `SubjectJiraClassifier`, `FakeMailSender`, `StubAiRunner`, `ManualClock`, `createTestEngine()`.

## Requests to others

- **orchestrator / server-data / store-sqlite (port additions I did not make)**: `AiJobRepository.claim(jobId): Promise<boolean>` (queued -> running atomically) and `AiJobRepository.listQueued(location, limit): Promise<AiJob[]>`. Without them two processes can run the same job and the in-memory queue is lost on restart (desktop queued jobs stay `queued`). Not added because store-sqlite is finished and a new required method would break its typecheck.
- **orchestrator (mail-core request, deferred)**: `MessageRepository.findThreadIdBySubject(...)` needs a stored normalized subject in both stores (schema + migration work in store-sqlite and server-data). Not added; mail-core works without it (Message-ID / References threading).
- **server-data**: implement `MessageAttachmentLookup` if `GET /attachments/:id/content` should work.
- **desktop-main / server-api**: pass `splitPatternPolicy: { isUnsafe: isUnsafeRegex }` (from `@relay/mail-core`) to `createEngineServices`.

## Decisions

- Done = move inbox messages to the `archive` role mailbox, undone = archive -> inbox, trash = inbox/archive -> `trash`, restore = trash -> inbox. Local thread state is written first and published; message locations are updated only after the provider move succeeds (UIDPLUS uid map). Without a uid map the message gets uid `0` (pending) and the next sync adopts the real uid by Message-ID. Provider failures are logged (warn) and do not fail the action.
- Read/unread: `markRead` sets `\Seen` on all unread messages; `markUnread` clears it on the latest message only. Labels map to IMAP keywords (label name); system keywords (`\...`, `$...`) are ignored. Keywords seen during sync create labels (`findByName` then `upsert`) before the message is stored.
- Reminders are local only (no provider move). `fireDue` re-checks the reminder inside the transaction, moves the thread back to `inbox` (a trashed thread stays in trash) and clears `remindAt`.
- Sync order per account: refresh mailboxes, then for every selected mailbox (inbox first) status + UIDVALIDITY check + fetch new UIDs, then for every mailbox expunges (`listUids`) + flag/keyword changes, then a final flush. Fetching before expunging keeps a thread's identity when another client moves its only message between mailboxes.
- Flags: with CONDSTORE on both sides `fetchFlagChanges(path, storedModseq)`; otherwise a full flag scan (`fetchFlagChanges(path, '0')`, mail-core returns every message's flags without CONDSTORE).
- Initial sync of a mailbox imports at most `initialMessageLimit` newest existing UIDs (via `listUids`) and skips messages older than `initialWindowDays`; it publishes `thread.upserted` but no `message.upserted`. Messages that fail to parse are logged and skipped; any other failure fails the sync without advancing the cursor.
- Thread state from sync: a new message in an inbox mailbox puts the thread into `inbox` (a reply revives a done thread). A new thread that only exists in sent/archive gets `done`, only in trash gets `trash`. When the last inbox message of an `inbox` thread is expunged, the thread becomes `done`. Threads without messages are deleted (`thread.removed`) together with their AI results.
- Thread summary: subject of the first message, snippet + `lastMessageAt` of the latest, participants = from/to/cc deduplicated by email, `messageCount` deduplicated by Message-ID, `unread` and `labelIds` over all stored copies, `aiOneLiner` / `remindAt` / `hasDraft` / `state` preserved, `splitIds` = existing + newly matched (only `splits.replace` / `reevaluate` removes memberships).
- Jira: every classified message calls `tasks.applyJiraEvent`; one task per Jira key, new task `open` (`source: 'jira'`, title = subject), `mention` / `assigned` / `comment` reopen to `open`, `status` / `other` keep the state, `threadId` follows the latest thread. Applied regardless of the `jiraTriage` AI toggle (classification is rule based).
- Account status: new accounts are stored as `connected` (so `listSyncable()` picks them up). Sync sets `syncing` -> `connected` (+ `lastSyncedAt`) or `error` (+ `lastError`), each with an `account.status` event. IMAP create and password/settings updates are verified with a live IMAP + SMTP check (`ProviderError` with both results). The account row is created before the vault entry (the server vault needs the account).
- Compose: replies thread via `inReplyToMessageId` (In-Reply-To + References). After SMTP the raw message is appended to the `sent` mailbox (skipped for Gmail, which saves it itself) and ingested right away when UIDPLUS returns the uid, so the reply shows up in the thread immediately. Once SMTP accepted the message, failures in append or draft cleanup are only logged. Scheduled sends use `claim` (pending -> sending) and end as `sent` or `failed` (+ error, draft kept).
- AI: request context is the `ThreadDetail` of the referenced thread (no mark-read). Results are saved as `AiResult` (oneLiner also sets `thread.aiOneLiner` and publishes `thread.upserted`). Output of a different kind than the job, a `failed` event or no output end as `error` (`<code>: <message>`). A missing runner falls back to any registered runner. A stream closed early ends the job as `error: cancelled: ...`.

## Review

gpt-6.1-sol reviewed the engine diff. Fixed: initial window by UID distance, catch-all skip of failing messages, stale summaries after a failed flush (known messages now re-touch their thread), thread identity lost on cross-mailbox moves, SMTP success reported as failure after cleanup errors, double run of a job inside one process, streams leaving jobs `running`, stale reminder snapshots, split re-evaluation overwriting concurrent thread changes, dedupe hiding unread/labels of other copies, account update storing settings without the new password, `throw` in test support. Not fixed (known gaps): see below.

## Known gaps

- Actions on messages with a pending uid (server without UIDPLUS, before the next sync) are not mirrored to the provider.
- No cross-process AI job claim and no persistent queue (needs the port additions requested above).
- Concurrent settings patches from two devices can lose a field (last write wins on the merged object).
- Split memberships and Jira tasks of messages whose batch flush failed are not recomputed on retry (the thread summary is).
- If the reconcile phase (expunges / flags) persists changes but the final summary flush fails, those thread summaries stay stale until the thread changes again (no durable pending-refresh list).
- A move by another client that happens between the fetch and the reconcile phase of one sync still recreates the thread with a new id on the next sync.
- No automatic one-liner jobs on new mail yet; callers create AI jobs explicitly.
