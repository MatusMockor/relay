# attachment-sweeper

## Status

Done. All scope committed and green (engine 238, store-sqlite 121, shared 50; server and desktop attachment suites green, full server 239 / desktop 321 before the lock change).

## What exists

- Engine ports: `AttachmentBlobCatalog` (`listCreatedBefore({ createdBefore, after, limit })`, `deleteUnreferenced(ids)`), `AttachmentReferenceRepository` (`findReferenced(ids)`), token `PORT_TOKENS.AttachmentBlobCatalog`. `EngineDeps.attachmentBlobs` is required, `EngineOptions.attachments` (`graceMs`, `intervalMs`, `batchSize`) is optional.
- Engine service `AttachmentSweeper` (`EngineServices.attachmentSweeper`): `sweep()` pages through blobs older than the grace period (default 24 h, never below 1 h) and deletes the unreferenced ones, one sweep at a time per process; `sweepDue()` runs at most once per interval (default 1 h); `release(ids)` deletes the given blobs if nothing references them (in batches).
- Account removal: `AccountService.remove` collects the attachment ids of the account's drafts before deleting the account and releases them afterwards (`AccountAttachmentRelease`). A failure is logged, the account is still removed and the periodic sweep catches the blobs later.
- Server: `PgAttachmentBlobCatalog` (Postgres repository), `AttachmentSweepScheduler` (pg-boss stately queue `sweep-attachments`, singletonKey, enqueued on boot and every `ATTACHMENT_SWEEP_INTERVAL_SECONDS`, default 3600). Grace from `ATTACHMENT_SWEEP_GRACE_SECONDS` (default 86400). Nothing runs when `JOBS_ENABLED=false`.
- Store SQLite: `SqliteAttachmentReferenceRepository`, factory `createSqliteAttachmentReferences(database)`.
- Desktop: `FileAttachmentBlobCatalog` (lists `<id>.bin` / `<id>.json` by mtime, re-checks references in SQLite right before removing), due job `attachment-sweep` (`sweepDue()` on the 30 s due-work tick). `storage/attachment-files.ts` holds the file naming shared with `FileAttachmentStore`.

## What references a blob

Only draft attachment rows (`draft_attachments` in both stores). Everything else goes through a draft: draft sends (the draft and its rows stay until delivery is recorded), scheduled sends (inline content is stored as a draft first and stays until the send is confirmed), forward (copies are put and attached in one request). An immediate inline send (`source: 'inline'`) only reads ids the client passes; with the legacy upload gone those ids can only come from a draft (the inline reply composer sends none), and a blob that vanished makes the send fail with `not_found` before anything is delivered. Received attachments are never cached in the store, they are fetched from IMAP on demand. AI tools and mcp-mail do not create blobs.

## Race safety

- In-flight uploads: a blob is put and attached within one request (`add`, `forward`). The sweeper only looks at blobs older than the grace period, so an upload that has not reached a draft revision yet is never a candidate.
- Postgres: `deleteUnreferenced` locks the candidates `FOR UPDATE SKIP LOCKED` (conflicts with the `FOR KEY SHARE` lock the FK check of a `draft_attachments` insert takes, so an uncommitted attach is skipped and a later attach waits), then deletes with a fresh `NOT EXISTS` check (sees references committed in between; an uncommitted delete+reinsert of a draft's rows still shows the committed reference). Covered by `test/persistence/attachment-blob-catalog.test.ts` with real concurrent transactions.
- In process (both platforms, needed for desktop where files and SQLite cannot share a transaction): `AttachmentReferenceLock` (`attachmentReferenceLockFor(catalog)`). `DraftService` runs every draft create/update write under the shared side (draft writes stay concurrent), the sweeper runs each `deleteUnreferenced` batch (reference check + removal) under the exclusive side. A draft write in flight finishes before the check; a write that starts during a batch waits for it. If a client attaches an id whose blob a sweep already removed (only possible for an id older than the grace period that nothing referenced), the draft points at a missing blob and sending fails with `not_found`, same as attaching an unknown id before.
- The lock is memoized per catalog instance (WeakMap) so `createComposeService` and `createAttachmentSweeper` share it without touching `create-engine-services.ts` again (calendar had uncommitted edits there).

## Legacy upload paths

`POST /attachments` (`api.attachments.upload`, `UploadAttachmentBodySchema`), `local.attachments.upload`, `ComposeService.uploadAttachment` and `DraftService.uploadAttachment` are removed. Only tests used them (renderer, desktop main, mcp-mail and the server had no callers); the tests now use the draft-scoped endpoints or the store directly. `GET /attachments/:id/content` and `local.attachments.content` stay. Notes `engine.md` and `desktop-main.md` still list the removed method/channel (historical notes of finished agents, not edited).

## Commits

442386e, 08a1134, 1fc4028, plus the review fix and this note (see git log).

## Tests

- `pnpm --filter @relay/engine test` (test/services/attachment-sweeper.test.ts: old orphan removed, referenced and fresh kept, grace boundary, failed-cleanup blob collected, reference appearing right before delete, paging, batching, single flight + interval, minimum grace, account removal and its failure).
- `pnpm --filter @relay/store-sqlite test` (test/attachment-reference-repository.test.ts).
- `pnpm --filter @relay/server test` (test/persistence/attachment-blob-catalog.test.ts against Postgres incl. concurrent transactions; test/attachments/attachment-sweep.e2e.test.ts through pg-boss and account removal over HTTP).
- `pnpm --filter @relay/desktop test` (test/main/local-attachment-sweep.e2e.test.ts: due-work tick and account removal over IPC with real files + SQLite + GreenMail).

## Review (gpt-6.1-sol)

- Fixed (high): desktop reference check and file removal not atomic against a concurrent draft write: added `AttachmentReferenceLock` (above), tests in `attachment-reference-lock.test.ts` and `attachment-sweeper.test.ts`.
- Partly fixed (medium): a forward that stalls longer than the grace period could lose early copies. Minimum grace raised from 10 min to 1 h, default stays 24 h; IMAP fetches and requests finish far sooner. Renewable upload reservations were not added (new state for a case the grace already covers).
- Rejected (low): pg-boss expires the stately job after 30 min while a sweep may still run, so two instances could sweep at once. Concurrent sweeps are safe (SKIP LOCKED + fresh NOT EXISTS delete), only redundant, and a sweep of 200-row batches finishing past 30 min is not realistic.
- Confirmed by the reviewer: Postgres locking argument under READ COMMITTED, no other blob references, legacy removal had no production callers, account removal handling.

CodeRabbit: not installed in this environment, not run.

## Known gaps

- No index on `attachments.created_at`; the sweep walks the primary key and filters by age (fine for the expected table size; add an index if it grows).
- Server cutoff uses the app clock, `attachments.created_at` uses the database clock; skew only shortens the 24 h grace marginally.
- `DraftService.removed` still throws when a blob delete fails after the draft row is gone (pre-existing behaviour tests rely on); the sweeper now cleans such leftovers.
