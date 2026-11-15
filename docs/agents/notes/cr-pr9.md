STATUS: DONE

# cr-pr9 (agent `cr-pr9`)

CodeRabbit findings on the server API PR (`apps/server/**`, without persistence, drizzle and the engine composition files). Every fix has a test that fails without it, unless noted.

## Findings

| #   | Where                                         | Verdict | What changed                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Dockerfile:48`                               | VALID   | `COREPACK_HOME=/opt/corepack` in `base`, the cache is copied from `deps` into `runtime`. Not built (no image was requested), so no test.                                                                                                                                             |
| 2   | `accounts/account-creation.service.ts:20`     | VALID   | The initial sync request is best-effort: a failure is logged and the account is returned. The scheduler picks the account up on its next tick (`lastSyncedAt` is null).                                                                                                              |
| 3   | `ai/mcp/local-server-url.ts:17`               | VALID   | `localOrigin(address)` maps `0.0.0.0` to `127.0.0.1` and `::` to `::1`, keeps specific addresses and brackets IPv6.                                                                                                                                                                  |
| 4   | `ai/mcp/mail-tools-grant-authorizer.ts:30`    | SKIP    | Valid gap, but the fix needs engine changes (request 1).                                                                                                                                                                                                                             |
| 5   | `app.module.ts:34` (`.env` before `parseEnv`) | SKIP    | `pnpm start` / `pnpm dev` run `vite-node`, which already loads `.env` from the working directory into `process.env` (checked with a probe script, with and without `.env`).                                                                                                          |
| 6   | `attachments/content-disposition.ts:8`        | VALID   | `'`, `(`, `)` and `*` are percent-encoded in `filename*`.                                                                                                                                                                                                                            |
| 7   | `auth/auth.controller.ts:34`                  | VALID   | `AuthRateLimitGuard` on register, login and refresh. A fixed window per route and client IP, plus per route and normalized email when the body has one. `AUTH_RATE_LIMIT_MAX` (default 20) and `AUTH_RATE_LIMIT_WINDOW_SECONDS` (default 60). Uses the engine clock. In-memory only. |
| 8   | `infrastructure/nest-engine-logger.ts:17`     | VALID   | The JSON replacer writes bigint as a string and repeated objects as `[Circular]`. Anything else that cannot be serialized becomes `"[Unserializable context]"` instead of throwing.                                                                                                  |
| 9   | `jobs/idle/imap-idle-manager.ts:95`           | VALID   | `restart` stops the session for a `disconnected` account before it compares settings.                                                                                                                                                                                                |
| 10  | `jobs/sync/sync-scheduler.ts:23`              | VALID   | The interval marker is removed when the enqueue fails, if it is still this attempt's marker.                                                                                                                                                                                         |
| 11  | `realtime/realtime-server.ts:90`              | VALID   | An upgrade URL that cannot be parsed destroys the socket instead of throwing in the `upgrade` listener.                                                                                                                                                                              |
| 12  | `realtime/realtime-session.ts:68`             | VALID   | Register, then re-authenticate, then send `welcome`. `RealtimeConnection` holds events until `open(welcome)`, so no event goes out before `welcome` or before the re-check.                                                                                                          |
| 13  | `test/ai/ai-job-completion.test.ts:241`       | VALID   | The extra connections are closed in `finally`. Test hygiene only, no failing test.                                                                                                                                                                                                   |
| 14  | `test/mail/missing-mailboxes.e2e.test.ts:129` | VALID   | The clock moves forward 1 s before `sync.now`. The test waits until the account's `lastSyncedAt` equals that time, then checks the done view once.                                                                                                                                   |
| 15  | `test/realtime/realtime.e2e.test.ts:50`       | VALID   | A marker event goes to Bob, and the test waits for it before it checks that Bob got exactly one event.                                                                                                                                                                               |
| 16  | `test/support/test-app.ts:36`                 | VALID   | Startup failures close the app (if it exists) and drop the database. `TestAppOptions.databaseName` was added so the test can check the drop.                                                                                                                                         |

New tests: `test/realtime/realtime.e2e.test.ts` (unparsable upgrade URL, revocation during hello), `test/mail/mail.e2e.test.ts` (disconnected account stops IDLE), `test/jobs/sync-enqueue-failures.e2e.test.ts` (findings 2 and 10, with a pg-boss insert trigger from `test/support/queue-faults.ts`), `test/auth/auth-rate-limit.e2e.test.ts`, `test/test-app.test.ts`, and unit tests for `localOrigin`, `contentDisposition` and `NestEngineLogger`.

## Requests

1. **cr2-engine (engine), finding 4.** Holder-less mail-tools grants (server runner) are accepted while the job is `running`, whoever runs it now. A superseded execution can keep calling mail tools after a reclaim. Needed: `AiMailToolsResolver` gets the claim owner (`(job, owner) => ...`) and `AiService` gets a check like `ownsJob(userId, jobId, owner): Promise<boolean>` (current `owner` matches and the lease is live). Then `ServerMailToolsResolver` puts `own` in the token and `MailToolsGrantAuthorizer` rejects a grant whose owner is no longer the job's owner. I will do the server half once the port exists.
2. **deploy owner.** Add `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_SECONDS` to `deploy/README.md`. Note there that the server runs with `trustProxy: true`, so the per-IP limit only holds when a proxy (the tunnel) sets `X-Forwarded-For`. A directly exposed server lets clients spoof the IP. The per-email limit still applies.
3. **Future.** The limiter is per process. Several server replicas would need a shared store (Postgres or Redis).

## Notes for other agents

- My first realtime fix (`src/realtime/*`) landed in `5a021df` (cr2-engine's Postgres commit). lint-staged backs up unstaged changes in `git stash` during every commit, and the concurrent commits picked up my working tree. The code in HEAD is the intended fix. The tests are in `740fba4`.
- Commit right after each change, and do not run `git stash` yourself in this shared checkout.

## Checks

All four pass on HEAD, after cr2-engine's engine commits landed:

- `pnpm --filter @relay/server lint`
- `pnpm --filter @relay/server typecheck`
- `pnpm --filter @relay/server test`: 57 files, 209 tests
- `pnpm format:check`
