# integration-core

Owner of everything except `apps/desktop/**` and `packages/shared/src/ipc/**` (those belong to `integration-desktop`).

## Status

Done. `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test --continue` all pass across the monorepo (shared 33, ai 45, mcp-mail 20, engine 82, store-sqlite 85, mail-core 110, server 124, desktop 120, ui 5, config 8).

## Shared contract changes (committed)

Commit `095ca1e` `feat(shared): ...`:

- `AiTaskKindSchema` + `'createTask'`.
  - Input: `{ kind: 'createTask', threadId: ThreadId, hint: string | null }` (hint 1..2000 chars).
  - Output: `{ kind: 'createTask', threadId: ThreadId, title: string, aiWhat: string }`. The engine creates the task (`source: 'ai'`) when the job finishes and publishes `task.upserted`.
- `chatAnswer` output: `references: ThreadId[]` (max 20, `.default([])`, so stored results without it still parse). The `[thread:<id>]` markers in `text` stay.
- `api.attachments.content`: `GET /attachments/:id/content`. The response is raw bytes, not JSON (`Content-Type`, `Content-Length`, `Content-Disposition: attachment; filename=...; filename*=UTF-8''...`, `X-Content-Type-Options: nosniff`). Don't run it through `parseEndpointResponse`. It works for uploaded draft attachments and received message attachments.
- `api.sync.now`: `POST /sync`. Body `SyncNowBodySchema = { accountId?: AccountId }`, defaults to `{}`, so the body may be omitted. Response `{ accepted: true }`. It triggers a sync of one account or of all of the user's accounts.
- `api.threads.updateChecklist`: `PATCH /threads/:id/checklist`.
  - Body `UpdateChecklistItemBodySchema = { itemId: string, done: boolean }`.
  - Response `ChecklistResponseSchema = { checklist: ChecklistItem[] }`.
  - The tick is stored in the latest summary AI result. `NotFoundError` (404) when the thread, the summary or the item doesn't exist.
- `DEFAULT_USER_SETTINGS.notifications` is now `'off'`.

## Engine / stores / mail-core changes (committed)

- `c37592c` engine, `525b1e0` store-sqlite (migration `0002_ai_queue_and_subjects`), `07559bf` mail-core, `d59fea4` ai.
- `services.checklist.update(userId, threadId, { itemId, done }): Promise<{ checklist }>`. Ticks are atomic per item (`AiResultRepository.updateChecklistItem`, row lock in Postgres), so concurrent ticks from two devices don't overwrite each other.
- AI queue is persistent: `AiJobRepository.claim(jobId, { owner, now, leaseUntil })`, `listQueued({ location, now, limit })`, `hasQueued(userId, kind, threadId)`, `create(job, claim?)`. `AiService.processQueued(limit)` reads queued jobs (and running jobs whose lease expired) from the repository, so jobs survive restarts. The in-memory queue is gone. `runJob` claims atomically (`ConflictError` when another worker has it). `ai.run` creates the job already claimed.
- `options.ai.queueInMemory` is removed from `AiOptions` (`fe4e1da`), thanks for dropping it in desktop.
- New `options.ai`: `oneLinersPerSync` (default 20, `0` turns automatic one-liners off) and `workerId` (lease owner name, default generated).
- Automatic one-liners: after each successful account sync, new inbox messages that are not from the account address and not bulk (`List-Unsubscribe`, `List-Id`, `Precedence: bulk|list|junk`, `Auto-Submitted` other than `no`) queue `oneLiner` jobs when `settings.ai.features.oneLiners` is on. One job per thread, newest threads first, at most `oneLinersPerSync` per run, no job when one is already pending or the latest one-liner is newer than the thread's last message. The location comes from settings. Desktop: the existing `DueWorkTicker` -> `ai.processQueued()` runs them when `ai.location === 'local'`.
- `createTask` jobs create the task (`tasks.createFromAi`, `task.upserted`) when they finish.
- `normalizeSubject` now lives in `@relay/engine` (mail-core re-exports it). `MessageRepository.findThreadIdBySubject(accountId, normalizedSubject, { since, until })` exists in both stores. `MessageRepositoryThreadLookup(messages)` uses it, so the subject fallback in `ReferencesThreadResolver` works with your existing wiring. The `subjectFinder` constructor argument is gone (nobody passed it).
- store-sqlite `migrate()` also backfills `messages.normalized_subject` for rows stored before the migration.
- mail-core: `extractAttachment(source, index): Promise<{ filename, contentType, content } | null>` (index = position in `Message.attachments`).

## Answers to integration-desktop requests (committed)

- `packages/shared/test/ipc.test.ts` allows the `oauth` namespace (`b6308a5`).
- `@relay/mail-core/presets` (`44cb96b`): browser-safe entry with `providerPresets`, `listProviderPresets`, `findPresetByDomain`, `guessSettings` and their types. New presets `zoznam`, `azet` (`azet.sk`, `post.sk`, `pobox.sk`), `centrum` (`centrum.sk`, `atlas.sk`), all IMAP 993 / SMTP 465 TLS. `icloud` already had `requiresAppPassword: true`.
- Attachment content (`fe4e1da`, `3b3ae5e`, `20f529e`): `services.attachments.content(userId, attachmentId): Promise<{ filename: string | null; contentType: string; content: Uint8Array }>`. It serves uploaded attachments from the `AttachmentStore` first, then received ones (message lookup -> `MailProvider.fetchMessage` -> extractor), and throws `NotFoundError` otherwise. To enable received attachments, pass two new optional `EngineDeps`:
  - `messageAttachmentLookup: createSqliteMessageAttachmentLookup(database)` (from `@relay/store-sqlite`);
  - `attachmentExtractor: new MailparserAttachmentExtractor()` (from `@relay/mail-core`).
    Without them only uploaded attachments are found. The server serves `GET /attachments/:id/content` through the same service.

## Review (gpt-6.1-sol, read-only)

All 5 findings were fixed, each with a regression test (`28b36e0`, `8b9d9c8`, `8f0a8d8`):

- A worker whose lease expired could still write status and results. Every claim now gets a unique owner token. Status writes match `claimed_by` and renew the lease, and the result is applied only after a successful fenced renewal.
- A recovered `createTask` job created a second task. The task id is now `task_<jobId>`, so a re-run upserts the same task.
- Jobs that were `running` before the upgrade were never claimable again. Migration `0002` (both stores) gives them an already-expired lease.
- Concurrent checklist ticks lost updates. Fixed with an atomic per-item update.
- One-liners could go stale. Only _queued_ jobs suppress a new one now (a running job no longer does), and freshness is measured against the start of the sync run instead of the message `Date` header.

## Known gaps

- Fencing still leaves a tiny window between the fenced renewal and applying the result.
- Automatic one-liners for users with `ai.location = 'local'` in synced mode are queued on the server and stay queued: the desktop's local runner can't read server data. At most one queued job per thread, so they don't pile up.
- Checklist ticks publish no realtime event. Other devices see them on the next thread fetch.
- Migration `0002` was edited after its first commit. A dev database that had already applied the earlier `0002` won't get the final two `UPDATE` statements. Fresh and test databases are unaffected.
- `packages/mcp-mail/src/cli/relay-mail-mcp.ts` has an uncommitted mode change (`100644 -> 100755`) from before this run. Left untouched.
