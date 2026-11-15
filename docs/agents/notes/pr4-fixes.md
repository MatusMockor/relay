STATUS: DONE

# pr4-fixes (agent `pr4-fixes`)

CodeRabbit fixes on the engine PR (`packages/engine/**`, `packages/store-sqlite/**`, Postgres implementations in `apps/server/src/persistence/**` after `pr8-fixes` finished, and wiring in the server and desktop composition).

## Port changes

- `SettingsRepository.saveIfUnchanged(userId, expected | null, next)`: compare-and-set. SQLite compares inside one synchronous executor call, Postgres uses `SELECT ... FOR UPDATE` or `INSERT ... ON CONFLICT DO NOTHING` when nothing is stored yet.
- `DraftRepository.deleteRevision(userId, draftId, updatedAt)`.
- `ScheduledSendRepository`: `claim(id, claimedAt)`, `releaseStaleSending(staleBefore)`, `cancel(userId, id, staleBefore)` (from `pr8-fixes`), and `markSent(id, sentAt, claimedAt)` / `markFailed(id, error, claimedAt)`, which are now fenced by the claim (`status = 'sending' AND claimed_at = claimedAt`) and return `boolean`.
- `ThreadRepository.setHasDraft(userId, threadId, hasDraft)`. SQLite `upsert` no longer overwrites `has_draft`. Postgres derives `hasDraft` from the drafts table, so there `setHasDraft` only reads the thread back.
- `TaskRepository.update(userId, taskId, TaskChanges)`: field-level update.
- `EngineDeps.credentialVault` is a `ConditionalCredentialVault`.
- New `PendingWorkRepository` (`repositories.pendingWork`, `PORT_TOKENS.PendingWorkRepository`), table `pending_work` keyed by `(account_id, kind, ref)` with a store-generated random `revision` that every `put` replaces. `remove(works)` deletes only rows still at the revision that was read, so a stale removal never deletes a row that was removed and recreated. Kinds: `provider-op`, `thread-refresh`, `message-effects`, `jira-event` (`engine/src/model/pending-work.ts`).

## Migrations

- SQLite `0005_scheduled_send_lease` (`claimed_ts`, one active send per draft, older duplicates cancelled first), `0006_pending_work`.
- Postgres `0007_unique_draft_references` (one draft per attachment, one active scheduled send per draft, duplicates removed or cancelled first), `0008_pending_work`.

## Behavior

- Scheduled sends: `sendDue` releases stale `sending` rows (lease `SCHEDULED_SEND_LEASE_MS` = 10 min) on every tick, and the server also calls `ComposeService.recoverStaleScheduled()` when the job workers register. Delivery sends without deleting the draft, records completion (3 attempts, never `failed` after a successful send), then deletes the sent draft revision. In Postgres the draft FK cascades and removes the scheduled send row once the draft is deleted; this was already the case before.
- Provider mirrors: handlers write the local change and the provider ops in one unit of work, then try them immediately. `ProviderOpReplayer` retries pending ops at the start of each sync (after mailbox refresh) and again at its end, after the fetch may have resolved a `PENDING_UID`. A state move looks at the pending move of a message first, so trash followed by restore while offline cancels out.
- Sync: `SyncJournal` replaces the in-memory `ThreadChangeSet`. Ingest, expunge, mailbox reset or removal and flag changes write `thread-refresh` (merged hints), `message-effects` (publish / inbox arrival with headers) and `jira-event` rows in the same unit of work as the message write. `ChangeFlusher` drains them from the store at every checkpoint and once at the start of the next sync. A failed Jira task stays pending and is retried on the next flush.

- Inbox arrivals stay in `pending_work` (as arrival-only `message-effects`) until the arrival listener has run at the end of a successful sync. A sync that fails before that replays them next time.
- Draft updates always move `updatedAt` forward by at least 1 ms, so `deleteRevision` cannot match a newer revision written in the same millisecond.

## Assumptions

- In-process serializers (`KeyedSerializer`, `services/shared/keyed-serializer.ts`) assume one process owns the work: provider op replay per account, settings update + relocation per user, split replace + re-evaluation per user. The desktop is one process and the server is assumed to run as one. Cross-process safety comes from the conditional writes (settings compare-and-set, split check, pending work revisions).

- Only one sync runs per account at a time. `SyncService` serializes per account inside one process, and the server is assumed to run a single process. The `thread-refresh` merge is a read-then-write inside a unit of work and relies on that.
- Split membership: the evaluator re-reads the splits inside its unit of work and skips the write if they changed. Atomic in SQLite (`BEGIN IMMEDIATE`). In Postgres (READ COMMITTED) a replace committing between that check and the writes can still slip through; the next replace or reevaluate fixes it.
- Draft attachment sharing is rejected in the engine (`DraftReferenceGuard`) and by unique constraints in both stores. Attachments dropped from a draft by an update are still not deleted (orphaned content), as before.

## Review

Read-only gpt-6.1-sol review of the commits. Fixed: concurrent provider replays (now serialized and revalidated), repeated pending work versions (now random revisions), draft cleanup after a lost claim (now skipped), inbox arrivals deleted before handling (now kept until handled), obsolete settings relocation and the Postgres split race (now serialized per user), equal `updatedAt` revisions (now strictly increasing), a `throw` in the fake mail sender. Accepted and left open: the items below.

## Open items

- The scheduled send lease (10 min) is not renewed. A delivery that takes longer can be recovered and sent a second time by another tick.
- `thread.upserted` / `thread.removed` are published after the refresh work is committed and removed. A crash in between loses the realtime event (clients still see the data on their next fetch).
- A Jira event is removed after `applyJiraEvent` succeeds. If only that removal fails, the next flush applies the event again and can reopen a task the user closed in the meantime.
- In Postgres, deleting the sent draft cascades to its scheduled send row, so sent history is not kept. This predates these fixes.

- If `markSent` keeps failing after a successful send, the row stays `sending`. After the lease it goes back to `pending` and may be sent again (the draft still exists because cleanup runs after completion). This is logged as an error.
- Moves on a message with a `PENDING_UID` wait until a sync fetches the target mailbox and adopts the real UID. If that mailbox is not synced (not in `mailboxRoles`), the op stays pending. There is no Message-ID search on the provider yet.
