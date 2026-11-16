# server-flaky

## Status

Done. Commits: `f887757`, `affa68f`, `0abe384`, `c9b4876`, `eca75c0`, `f1a5ec6`.

## Flaky server tests

- Test infra containers (`relay-test-*`) had exited after a host restart; started them again with `pnpm test:infra:up` (no restart or `down`).
- `sync-enqueue-failures`: `deadlock detected` on `fault.clear()`. `DROP TRIGGER` on the partitioned `pgboss.job` and a pg-boss worker fetch (parent, then queue partition) lock in opposite orders. Test-only DDL, not a production bug. Fixed: the fault trigger now lives on the queue's own partition (`test/support/queue-faults.ts`).

- Lost update (production bug): sync `refreshThread` and the split membership writer read a thread and upserted the whole summary, overwriting a reminder / done / trash move or split change committed in between (snoozed thread came back to the inbox, seen as a `mail.e2e` timeout). Fixed with `ThreadRepository.lockForUpdate` (Postgres: `SELECT id ... FOR UPDATE`, then a fresh read so the split/label subqueries see the committed state; SQLite and memory: plain read, SQLite write transactions are serialized). Deterministic test: `apps/server/test/persistence/thread-refresh-race.test.ts`.
- `sorry, too many clients already`: one server suite peaks at ~45 Postgres connections (app pools + 4 pg-boss connections per job-enabled app). Two suites or several agents' suites on the shared DB exhaust the default 100, which shows as 500s, failed app starts and "Realtime session failed". `docker-compose.test.yml` now sets `max_connections=400`. **Orchestrator: this needs the test Postgres container recreated (`pnpm test:infra:up` after a `down`), which I did not do.** Verified on a private container with 400: two parallel suites, no exhaustion.

## Lease renewal (ready, others may use)

- Port `IntervalTimer` (`repeat(intervalMs, task) => cancel`), optional `EngineDeps.intervalTimer` (defaults to `systemIntervalTimer`, unref'd `setInterval`). No composition-root change needed.
- `LeaseHeartbeat` (`services/shared/lease-heartbeat.ts`): `start(renewal, logContext)` / `hold(renewal, logContext, work)`. A `HeldLease` has `signal` (aborted with `LeaseLostError` once a renewal reports the lease taken over) and `ensureHeld()` (renews now, throws `LeaseLostError` if lost). Transient renewal errors are logged and retried on the next beat.
- Sends: `SendLeases.holdDraft` / `holdScheduled` wrap `SendService.sendNow(userId, content, lease?)`, which calls `lease.ensureHeld()` right before `MailSender.send`. Renewal every 150 s (lease 600 s). Scheduled sends renew the scheduled-send row and the draft claim together.
- Repositories: `DraftRepository.renewSendClaim(userId, draftId, { claimedAt, renewedAt })`, `ScheduledSendRepository.renew(id, claimedAt, renewedAt)`. Both are CAS on the claim token. New columns `drafts.send_renewed_at` / `scheduled_sends.renewed_at` (SQLite `*_ts`); staleness = `coalesce(renewed, claimed) < staleBefore`; claim, release and settle clear the renewal.
- Leases are held through finalization: draft sends until the sent draft is cleaned up, scheduled sends until `markSent` / confirmation. Renewals are serialized (a beat and `ensureHeld()` never run two renewals at once).
- Server AI worker: `AiJobExecutor` renews via `AiJobStatusWriter.renew` every lease/4 (45 s by default) and aborts the runner signal when the lease is lost. Completion stays owner-fenced.
- Test support: `ManualIntervalTimer` (`engine.timer.fire()`), `MemoryCredentialVault.beforeGet` hook.

## Notes for compose-extras

- `SendService.sendNow` has a third optional `lease` parameter and calls `lease?.ensureHeld()` between building the outgoing message and SMTP. Please keep that call right before `sender.send` if you change the method.
