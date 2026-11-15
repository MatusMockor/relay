STATUS: DONE

# cr2-engine (agent `cr2-engine`)

Second round of CodeRabbit fixes in `packages/engine/src/**`, `packages/store-sqlite/**` and `apps/server/**`, plus the requests from `cr2-mail.md`. Commits on `feat/mvp-core`: `7c3b202` (engine), `3531869` (SQLite), `5a021df` (Postgres), `9ad2a39` (engine, cr2-mail requests), `00d94a1` (mail-core error swap), `3d08dd6` (engine, review fixes).

## Port changes

- `DraftRepository.update(userId, draftId, changes, { expected, next })` updates only while `updatedAt = expected`. It returns `null` otherwise, and `DraftService.update` turns that into `NotFoundError` (draft gone) or `ConflictError` (changed meanwhile).
- `DraftRepository.claimForSend(userId, draftId, { claimedAt, staleBefore })` / `releaseSendClaim(userId, draftId, claimedAt)`. The new column is `drafts.send_claimed_ts` (SQLite) / `drafts.send_claimed_at` (Postgres). A claim succeeds when there is none or the existing one is older than `staleBefore` (lease `DRAFT_SEND_LEASE_MS` = 10 min). A release only works for the matching `claimedAt`.
- `ScheduledSendRepository.releaseStaleSending(staleBefore, keep)` never releases the ids in `keep`.
- `PendingWorkRepository.listByKind(kind)` lists one kind across accounts. New kind `scheduled-send-sent` (`ScheduledSendSentWork`).
- `TaskRepository.createOrGetByJiraKey(task)` returns `{ task, created }` (`INSERT ... ON CONFLICT DO NOTHING`, then read by `(user_id, jira_key)`).
- `MessageRepository.addLabel` / `removeLabel` change one label. `updateLabels` (full replace) stays for sync.
- `PartialMoveError` and `UidValidityChangedError` live in `@relay/engine` now. `@relay/mail-core` re-exports them and its own files are gone.

## Migrations

- SQLite `0007_draft_send_claim`, Postgres `0009_draft_send_claim` (nullable column, no data change).
- No migration for finding 4: `tasks_user_jira_unique` on `(user_id, jira_key) WHERE jira_key IS NOT NULL` already exists in both stores since `0000_init` / `0001_core_schema`, so duplicates cannot exist.

## Per finding

1. Double immediate send: `DraftSender` (used by `ComposeService.send` for a draft source) claims the draft before reading and sending it. It refuses with `ConflictError` while a scheduled delivery of that draft is unconfirmed, and releases the claim on failure. After a successful send it deletes the sent revision. If the draft was edited meanwhile, it releases the claim and keeps the draft. If the delete fails, it keeps the claim until the lease ends. `SendService.sendNow(userId, content)` no longer deletes drafts. `ScheduledSendDelivery` claims the draft with the scheduled send's `claimedAt`. If the draft is claimed by a manual send, the scheduled send stays `sending` and lease recovery retries it. If the draft is missing, it is marked failed. Classes: `draft-send-claims.ts`, `draft-sender.ts`, `sent-draft-cleanup.ts`.
2. Unrecorded scheduled delivery: after 3 failed `markSent` attempts the draft stays and stays claimed. `ScheduledSendConfirmations` stores a `scheduled-send-sent` pending work entry. If that write fails too, it holds the confirmation in process memory and retries persisting it every tick. `recoverStale` replays confirmations first (markSent fenced by the original claim, then delete the sent draft revision or release the claim) and passes every unconfirmed id to `releaseStaleSending` as `keep`. If the pending work list cannot be read, recovery throws and nothing is released. `cancel` and manual sends of the draft are refused with `ConflictError` while a confirmation is pending. If deleting a delivered draft fails, the delivery writes the same confirmation, so the cleanup is retried on the next tick and the draft stays unsendable until then. A replayed confirmation is removed only after its cleanup succeeded. `markSent` returning `false` while the row is already `sent` (a commit whose reply was lost) now counts as recorded. The terminal state is the existing `sent` status, so the shared status enum is unchanged.
3. Jira events: `jiraTaskStateChange(event)` returns `{ state: 'open' }` only for mention/assigned/comment. Otherwise `state` is left out of the update.
4. Duplicate Jira tasks: `applyJiraEvent` uses `createOrGetByJiraKey`. The memory adapter now enforces the unique key too.
5. Old inbox arrival: `resolveState` returns `inbox` for an arrival hint only if a message of the thread is still in an inbox mailbox. Otherwise it falls through (`done` for a new thread, the existing state otherwise).
6. Labels: `LabelHandler` uses `addLabel` / `removeLabel`.
7. Draft revision: see port changes. `deleteRevision` can no longer match a concurrent edit, because an edit based on the old revision fails instead of overwriting.
8. Attachment exclusivity: confirmed, no change. SQLite `draft_attachments.id` is the attachment id and the primary key. Postgres has `draft_attachments_attachment_unique` (from `0007_unique_draft_references`, which also removed duplicates).

## cr2-mail requests

1. Error classes moved into the engine, mail-core imports them (done by me, as offered).
2. `ProviderOpReplayer` treats `PartialMoveError` as a completed move: it records each message at the target with `uidMap.get(uid) ?? PENDING_UID` and removes the op, so nothing is copied again.
3. `AccountSynchronizer` catches `UidValidityChangedError` per mailbox, skips that mailbox's pass without checkpointing and continues with the others. The next sync resets the mailbox. Before this, the whole account sync failed (also without checkpointing).
4. `FakeMailProvider.fetchSince` throws `UidValidityChangedError`. New fake hooks: `FakeMailServer.partialMoves`, `beforeNextFetch`.

## Tests (each fails without its fix, checked by reverting the fix)

- Engine: `compose-concurrency` (overlapping sends, send after a failed send, scheduled + manual send, stale draft update), `scheduled-send-recovery` (draft kept and no resend after the lease, confirmation held in memory, cancel refused, no release when confirmations cannot be read, manual send refused while unconfirmed, failed draft removal retried, scheduled send left for recovery during a manual send), `tasks` (status event keeps `done`, one task for two concurrent events), `sync-durability` (old arrival after done), `message-actions` (two concurrent label adds), `provider-mirror-retry` (partial move), `sync-incremental` (UIDVALIDITY change mid-sync).
- SQLite: `compose-repository`, `message-repository`, `pending-work-repository`, `task-reminder-repository`.
- Postgres: `guarded-writes`, `messages-labels`, `pending-work`, `tasks-reminders`, `scheduled-send-recovery`.

## Review

`codex exec -m gpt-6.1-sol -s read-only` over `7c3b202 3531869 5a021df 9ad2a39 00d94a1` returned 3 findings, all valid and fixed in `3d08dd6`, each with a test that fails without the fix:

1. (high) After the lease, a manual send could reclaim a draft whose scheduled delivery was unconfirmed and send it again. Manual sends now check pending confirmations.
2. (high) A failed delete of a delivered draft released its claim, and replay removed the confirmation before the cleanup. The claim is now kept, and the cleanup is retried through the confirmation.
3. (medium) Draft claim contention marked a scheduled send failed, so the schedule was lost when the competing manual send failed. It now stays for lease recovery.

## Known single-process limitations (deferred on purpose)

- `state-move-handler.ts`: done and undone running at the same time can leave the local location and the provider move out of step.
- `draft-thread-flag.ts`: `hasDraft` is derived and written in two steps, not as one atomic projection.
- `split-membership-evaluator.ts`: membership is recomputed before apply, not inside it.
- `change-flusher.ts`: `thread.removed` notifications are published after the work is removed and are not durable.

## Open items

- The draft send lease and the scheduled send lease (10 min) are not renewed. A send that takes longer can be claimed again.
- A confirmation held only in memory (the pending work write failed as well) is lost on a process restart. After the lease, that row can then be sent again.
- An unrecorded delivery stays `sending` in the UI until its confirmation is replayed on a later tick.
- A draft whose manual send succeeded but whose delete failed keeps its claim only until the lease ends (no durable cleanup for immediate sends). After that, it can be sent again by hand.
- The review fixes in `3d08dd6` were not re-reviewed by gpt-6.1-sol.
- `pnpm test --continue` currently fails only in `@relay/mcp-mail`: all 31 tests pass, but `test/socket-bridge.test.ts` ("fails pending and later calls once the host goes away", added in `34ad04d` by `cr-pr6`) leaks an unhandled rejection "Relay mail tools connection closed" from `socket-mail-tool-backend.ts:46`. That is not my area and I did not touch it.
