STATUS: DONE

# pr8-fixes (agent `pr8-fixes`)

CodeRabbit fixes on the server persistence PR (`apps/server/src/persistence/**`, `apps/server/drizzle/**`, `apps/server/test/persistence/**`, `deploy/**`). Each fix has a real-Postgres test that fails without it, unless noted.

## Findings

1. Subject index: new migration `0005_subject_hash_index` replaces `messages_account_subject_idx` with `messages_account_subject_hash_idx` on `(account_id, md5(normalized_subject), date desc)`. `findThreadIdBySubject` filters on `md5(normalized_subject) = md5($1)` plus exact equality.
2. `PostgresUrlSchema` (scheme check only) in `persistence-config.ts`, also used by `src/config/env.ts` (it had the same strict `z.url` check and would still have rejected socket URLs at startup).
3. Backfill UPDATE matches `id`, the selected `subject` and `normalized_subject IS NULL`. It counts `rowCount`.
4. `PgAccountRepository.update` locks the target row (`FOR UPDATE`) before clearing the current primary.
5. `enqueueIfAbsent` retries the insert once when the conflict lookup finds no active job.
6. Draft reads use one statement (`draft-selection.ts`, a `json_agg` subquery). `loadDraftAttachments` is gone.
7. `replaceMessageLabels` locks the message row first.
8. `revokeDevice` sets `devices.revoked_at` and revokes the tokens in one transaction. `rotate` takes `FOR SHARE` on the device after the family lock and returns null for a revoked or missing device.
9. Migration `0006_scheduled_send_claims` adds `scheduled_sends.claimed_at`. API below.
10. `replaceAll` rejects split ids owned by another user with `ConflictError`: a pre-check before the delete, plus an upsert `RETURNING` check that rolls back on a concurrent insert.
11. The scheduled folder counts `pending` and `sending`.
12. Search terms split on anything that is not a letter, mark or number.
13. Fixtures use sequential default message uids.
14. `createTestDatabase` drops the database when migrations fail and rejects with the original error. It has new `name` / `migrationsFolder` options.
15. Deploy README: `openssl rand -hex 24` for `POSTGRES_PASSWORD`, which goes unencoded into `DATABASE_URL`. No test.

New test helpers: `test/persistence/support/lock-holder.ts` (a second transaction holding locks, plus `waitForLockWaiters`) and `support/intercepted-database.ts` (a drizzle db whose pool runs a hook once after a matching query).

## ScheduledSendRepository: stale `sending` recovery (engine wiring belongs to `pr4-fixes`)

The Pg implementation matches the port as `pr4-fixes` changed it (params required):

- `claim(scheduledSendId, claimedAt: string): Promise<boolean>`: `pending` -> `sending`, stores `claimed_at`.
- `releaseStaleSending(staleBefore: string): Promise<number>`: rows in `sending` with `claimed_at IS NULL OR claimed_at < staleBefore` go back to `pending`, with `claimed_at = NULL`. Returns the number reset. Call it on server start and on every due-sends tick with `staleBefore = now - 10 min`.
- `cancel(userId, scheduledSendId, staleBefore: string): Promise<boolean>`: cancels a `pending` row, or a `sending` row whose `claimed_at` is NULL or older than `staleBefore`.
- `markSent` / `markFailed` clear `claimed_at`.
- Open item for `pr4-fixes` (from the gpt-6.1-sol review): `markSent` / `markFailed` are not fenced by the claim. A worker that outlives its lease can overwrite the status set by a newer claim or by a cancel. A fence needs a port change, e.g. `markSent(id, sentAt, claimedAt)` with `WHERE status = 'sending' AND claimed_at = $claimedAt`. Not done here, because a plain `status = 'sending'` guard would make a late success after recovery send the mail twice.

## State at handover

- `apps/server` typecheck fails only on the port methods `pr4-fixes` adds (`saveIfUnchanged`, `setIfUnchanged`, `deleteRevision`, `setHasDraft`). 12 e2e tests fail with `PATCH /settings` 500 for the same reason (the engine calls `settings.saveIfUnchanged`). All persistence tests pass.
- Review: read-only gpt-6.1-sol pass over the commits. The split race, the weak backfill test and the `throw` in the test helper are fixed. The claim fence is the open item above.
