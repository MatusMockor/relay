# desktop-server-tests

Status: done. Suite green on `feat/next-batch` (also reused by compose-extras for `draft-attachments.test.ts`).

## What exists

Real end-to-end suite for desktop synced mode in `apps/desktop/test/integration/real-server/`.

- `support/relay-server.ts` - `startRelayServer({ env? })` boots the real `apps/server` as a child process (`node <server>/node_modules/vite-node/vite-node.mjs src/main.ts`, cwd `apps/server`), so the desktop never imports server code. Own database `relay_test_desktop_<hex>` per test file (created with `pg`, migrated by the server on start, dropped `WITH (FORCE)` in `close()`), `MAIL_ALLOW_PLAINTEXT=true`, `JOBS_ENABLED=true`, `IMAP_IDLE_ENABLED=false`, no server AI CLI (`AI_CLI_PATH` points to a missing dir, so the owner's real Claude/Codex is never found).
- Readiness: polls `GET /health` (zod `HealthResponseSchema`) every 100 ms, fails fast when the child exits, prints the last 300 server log lines in the assertion message.
- Port: `support/port-lease.ts` leases a random port in 20000-29999 (outside the Linux and macOS ephemeral ranges, so `listen(0)` in other tests can never take it) guarded by a lock file in `os.tmpdir()` published atomically with `link()`. Locks of other processes are never deleted (a crashed run only takes its port out of the pool until tmp is cleaned). Boot is retried on `EADDRINUSE` and on Postgres "too many clients" within a 90 s total budget; use `SERVER_HOOK_TIMEOUT_MS` (120 s) on the `beforeAll`/`afterAll` that start and close the server.
- Teardown: SIGTERM by PID, SIGKILL after 10 s, then drop the database and release the port lock. Idempotent. The DB is also dropped when boot itself rejects, and the child is SIGKILLed if the test worker exits without teardown.
- `support/synced-desktop.ts` - the real desktop synced stack: `ServerSessions` + `EncryptedFileSecretStore` + `DeviceSettingsStore` + `composeIpc` (main) -> `InMemoryIpc` -> `createRelayBridge` (preload) -> `createElectronPlatform` + `createServerApi` + `createSyncedServices` (renderer). Clock is a `ShiftedClock` so tests can move the desktop's time.
- `support/query-harness.tsx` - TanStack Query + `ServicesProvider` wrapper for `renderHook` (jsdom).
- `support/mail-fixtures.ts` - GreenMail mailbox with Archive/Sent, SMTP send that waits for delivery, envelope reader.
- `test/main/support/stub-claude.ts` now also answers the one-liner prompt (`jednu krátku vetu`) and, when `--mcp-config` has an http server, POSTs MCP `initialize` with its headers and records `mcpStatus` in `calls()`.

## Coverage (8 tests, about 18 s)

- `session.test.ts`: register through main (`session.setTokens`), `me`, devices list on two desktops; refresh-ahead rotation when the desktop clock is 15 min ahead (new refresh token stored in main), replay of the old refresh token is rejected (`TokenRefreshRequest` -> `rejected`) and the next renderer call gets 401, renews in main, the refresh is rejected, `onSessionExpired` fires and tokens are cleared; device revoke from a second desktop closes the realtime socket and the reconnect alone signs the revoked desktop out; logout removes the device on the server and the tokens in main.
- `mail.test.tsx` (jsdom, TanStack Query): `testConnection` + `createAccount` against GreenMail, `useThreadList`/`useAccounts` + `useRealtimeSync` follow the server sync only through realtime events, `syncNow(accountId)` and `syncNow()`, per-account list; `useThreadDetail` + `useThreadAction` done/undone moves the message to Archive and back in GreenMail; 404 error shape; inline reply arrives in the partner's GreenMail INBOX with the right `In-Reply-To`, and the thread gets 2 messages.
- `remote-ai.test.ts`: the main-process `RemoteAiSupervisor` (poll interval 60 s, so claims come from the realtime wakeup) claims the automatic one-liner and a renderer `runAi` summary job, runs them with the stub `claude`, completes them on the server; the renderer run receives `started` + `completed`, `aiSummary` and `aiOneLiner` are stored, the CLI got the real thread text and the server MCP URL, and its Bearer token was accepted by the real `/mcp` (HTTP 200) during both runs. The summary claim is necessarily event-driven: the worker idles before any job exists, the one-liner is claimed by the welcome or an event wake (both need a welcomed socket), and the 60 s poll is longer than the test.

## Removed fake-server tests (fully covered by the real suite)

- `test/main/remote-ai-worker.e2e.test.ts`: "runs a queued server job with the local CLI and the server mail tools" (real test also proves the MCP Bearer works).
- `test/integration/renderer-session-over-ipc.test.ts`: "renews after a 401 in main and signs out when the server rejects the refresh", "stores the login and removes it on logout through the session channels".
- `src/renderer/test/remote-mail-client.test.ts`: "surfaces the shared API error shape" (real test asserts code, status and the server message).

Restored after the gpt-6.1-sol review (their exact request-shape assertions are not provable with one account): "calls typed contract endpoints with the access token", "asks the server to sync now for one or all accounts", "claims at once when the server announces a queued local job".

Kept on purpose (fast unit-level behaviour the real server cannot produce on demand): refresh dedup and races (`remote-ai-session`, `remote-lifecycle`, `session-transitions`, shared refresh in `renderer-session-over-ipc`), 503/unreachable refresh, browser `RendererTokenSession`, socket drop + reconnect, realtime-only AI completion (the real run can also finish by polling), lease loss, no-runner/server-location/sign-out states, attachments, checklist, all UI tests on `contract-server`.

## Results

- Worktree at `335073c` + this suite (while HEAD could not boot, see below): 10/10 green while `@relay/server` tests ran twice concurrently (217/217), full `@relay/desktop` 71 files / 299 tests green.
- Main tree after the calendar wiring landed: 10 + 6 + 10 runs of my 8 tests with `@relay/server` tests as concurrent load; 25/26 green. The one red run (4 of 8 failed) happened while other agents were editing and running tests in the shared tree; its log was not captured and the next 16 runs (logged) were all green, so the cause is unknown. Full `@relay/desktop` 78 files / 321 tests: 3/4 green, the red one was `compose-flows.test.tsx` "keeps the composer when sending is cancelled" timing out under load (passes alone, not part of this suite).
- After runs: no `vite-node` server left, no `relay_test_desktop_*` database, no port lock files of mine.

## CI

- No workflow change needed: `ci.yml` already provides Postgres (5433) and GreenMail, and `pnpm test` (turbo `test`, no cache) runs the suite inside `@relay/desktop`. `apps/server` runs from source via its own vite-node, so no build step is involved.

## Resolved blocker

- Between `166a94c` and the calendar wiring commits, `EngineDeps.calendar` was required but not passed by the server and the desktop local engine, so the server could not boot (`calendar.expander` undefined). Fixed by the calendar agent; the suite is green on the branch now.

## Requests

- compose-extras: `real-server/draft-attachments.test.ts` should pass `SERVER_HOOK_TIMEOUT_MS` to its `beforeAll`/`afterAll` (boot may take longer than the default 30 s hook timeout under load, and a timed-out `beforeAll` leaves `server` null so `afterAll` cannot clean up). Also: your file was briefly swept into my commit `a08004b` by a directory pathspec and removed again in `126c709`; sorry, nothing of yours was changed.
- orchestrator: CI Postgres service runs with the default 100 connections; `eca75c0` raised the local test container to 400 but the CI service in `ci.yml` was not changed. The harness retries "too many clients" only at boot, not during requests.

## Dependency added

- `apps/desktop` devDependencies: `pg@8.16.3`, `@types/pg@8.15.6` (already in the lockfile for the server). Committed only my lockfile hunks (the calendar hunks were left untouched).

## Notes for others

- The suite runs the server from the working tree. When another agent's WIP breaks server boot, this suite fails at `startRelayServer` with the server log in the message.
- Run it alone with `pnpm --filter @relay/desktop test:real-server`.
- CodeRabbit CLI is not installed on this machine, so only the gpt-6.1-sol review ran (two rounds, findings fixed or listed above).
