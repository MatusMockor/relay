# review-fixes (agent `review-fixes`)

Fixes for the read-only gpt-6.1-sol review of `23d6594..606f3b3`. Commits `7c26484`, `d211f5c`, `5a5866e`, `0bcef18`, re-check follow-ups `4fe8838`, `66292a9` and the last commit with these notes.

## 1. Single owner of the server token refresh (desktop)

- Shared IPC `session.*` (`packages/shared/src/ipc/session-channels.ts`): `getAccessToken({ serverUrl, rejected? }) -> { accessToken, expired }`, `setTokens`, `clear`, `hasTokens`.
- Main: `ServerSessions` -> one `ServerSession` per canonical URL, shared by the IPC handlers (`handlers/session-handlers.ts`) and the remote AI worker. Refresh, save and clear run through one serialized queue. `TokenRefreshRequest` does the HTTP call.
- Renderer: `SessionTokens` strategy used by `HttpApi`, `ServerApi` and `RealtimeConnection`. `MainProcessSession` in Electron (`Platform.serverSession`), `RendererTokenSession` (own refresh) only in the browser `dev:web` mode. `SecureTokenStore` is gone.

## 2. Atomic completion (engine)

- `AiJobCompleter` writes the fenced `done` status, the AI result, the one-liner and the AI task in one `UnitOfWork` and publishes `thread.upserted`, `task.upserted` and `ai.job.updated` after commit. Used by `AiJobExecutor` (server and local runs) and `ExternalAiJobSettlement` (device completions; a failing apply then settles the job as `error`).
- `AiTaskBuilder` holds the AI task validation shared with `TaskService.createFromAi`.

## 3 + 4. Atomic enqueue and source-message freshness

- Thread-scoped inputs (`oneLiner`, `summary`, `replySuggestions`) carry `sourceMessageId`, stamped by `AiJobFactory` with the thread's latest message (by date). `AiResult.sourceMessageId` stores it (columns in both stores).
- `AiJobRepository.enqueueIfAbsent(job) -> { job, created }` replaces `hasQueued` / `hasPending`. It returns the already active job on conflict. Backed by the partial unique index `ai_jobs_active_source_idx` on `(user_id, thread_id, kind, source_message_id)` for queued/running jobs. Migrations `0004_ai_job_sources` in both stores.
- The key includes the source message on purpose: a new message while a job runs still queues a fresh job.
- Preparer: a result is fresh only when `result.sourceMessageId` is the current latest message. One-liners also keep the sync-start check, so late mail with an old `Date` header still refreshes.

## 5. Pending AI state (renderer)

- `ThreadAiState.jobs: { kind, jobId }[]` (defaults to `[]`).
- `ai-job-cache.ts` remembers settled job ids per `QueryClient`, strips them from a late prepare response, and reconciles open jobs with `getAiJob` after prepare and after a realtime reconnect (`MailClient.onReconnect`). Failed jobs are never queued again. Local mode: `local.ai.getJob` IPC.

## Re-check follow-ups

- `ServerSession` keeps a rejected session reported as `expired` until the next `save` / `clear`, so a rejection hit by the worker still sends the renderer to sign-in.
- Pending jobs are reconciled on every realtime `welcome` (`MailClient.onRealtimeConnected`), including the first.
- An explicit queued job of a thread kind joins the active one (`AiJobFactory.create` uses `enqueueIfAbsent`). Jobs created already claimed (streamed `ai.run`) keep `sourceMessageId` in the input, but store no `source_message_id` column, so they never hit the unique index.
- A result is skipped when a newer job (by `createdAt`) of the same thread and kind is already done (`AiJobRepository.hasNewerDone`), under `lockResultSlot` (Postgres advisory transaction lock; SQLite transactions are already serialized).
- Automatic one-liners use the newest arrival of the sync run as their source.

## Known gaps

- Summaries and reply suggestions for late mail whose `Date` is older than the current latest message are not regenerated (the latest message by date does not change). Same as before.
- Results stored before migration `0004` have no source message, so each thread gets one extra summary run after the upgrade.
- A queued job for an older message and a new one for the latest message can both run (one wasted CLI run).
- Two jobs of the same thread and kind created in the same millisecond are not ordered, so neither fences the other. A tie-break by id was tried and dropped: ids do not follow creation order. The next prepare repairs a stale result.
