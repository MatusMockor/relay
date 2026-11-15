# remote-ai (agent `remote-ai`)

Synced mode with `ai.location = 'local'`: jobs are queued on the server, and the desktop of the same user claims them and runs them with the Claude Code / Codex CLIs installed on that machine.

## Status

Done. Implementation, tests and the gpt-6.1-sol review fixes are committed.

## Design

- The server stays the source of truth. A device claims a queued `local` job with an atomic lease (`AiJobRepository.claim`, owner `remote:<deviceId>:<leaseId>`, location `local`, 120 s lease), keeps it with heartbeats, then completes or fails it. Every write is fenced by the owner **and** by `status = 'running'` (`AiJobUpdate.fromStatus`), so a late heartbeat cannot revive a finished job and another device cannot settle someone else's lease.
- A remote completion takes the terminal `done` status atomically first, then applies the result (a failure reverts the job to `error`), so two concurrent completions cannot both apply output. Results go through the same `AiResultApplier` as server runs: `AiResult`, `thread.aiOneLiner` + `thread.upserted`, task creation for `createTask` (`task_<jobId>`), `ai.job.updated` for running / done / error.
- The claim response carries the job, the lease and the `ThreadDetail` (no mark-read), so the local CLI gets the same prompt context as on the server.
- Mail tools for the CLI: the device asks for a job token (`POST /ai/worker/jobs/:id/mail-tools-token`, needs the lease, 5 min TTL) and points the runner at `<server>/mcp` (streamable HTTP, `Authorization: Bearer`). Server MCP tokens are now always job-scoped (`job` claim): `/mcp` accepts a token only while its job is `running`, and only `chatAnswer` jobs may use `create_task` / `create_draft` (`scopeMailToolsToJob`). Device tokens also carry the device and lease: every MCP request checks that the device is still active and still holds the lease (a fenced heartbeat), so a token dies on lease handoff and device revocation. The server's own runs use job tokens without a holder (15 min TTL).
- Claims only happen when the user's effective `ai.location` is `local`; otherwise the endpoint answers `{ location: 'server', jobs: [] }` and the worker slows down to one poll per minute.

## Endpoints (`api.ai.*`, `packages/shared/src/api/endpoints/ai-worker.ts`)

| name                | route                                       | body                                        | response                                                     |
| ------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `claimJobs`         | `POST /ai/worker/claims`                    | `{ limit?: 1..5 }`                          | `{ location, jobs: { job, leaseId, leaseUntil, thread }[] }` |
| `heartbeatJob`      | `POST /ai/worker/jobs/:id/heartbeat`        | `{ leaseId }`                               | `{ leaseUntil }`                                             |
| `completeJob`       | `POST /ai/worker/jobs/:id/complete`         | `{ leaseId, runner, output: AiOutput }`     | `AiJob`                                                      |
| `failJob`           | `POST /ai/worker/jobs/:id/fail`             | `{ leaseId, code: AiFailureCode, message }` | `AiJob`                                                      |
| `jobMailToolsToken` | `POST /ai/worker/jobs/:id/mail-tools-token` | `{ leaseId }`                               | `{ token, expiresAt, path: '/mcp' }`                         |

Errors: unknown job / other user -> 404, lease lost or job not running -> 409, output of another kind -> 400. The worker id is always the authenticated device (`Principal.deviceId`).

Engine: `AiService.claimExternal(userId, workerId, limit)`, `heartbeatExternal(userId, jobId, { workerId, leaseId })`, `completeExternal(..., { runner, output })`, `failExternal(..., { code, message })`.

## Desktop main (`apps/desktop/src/main/ai/remote/`)

- `RemoteAiSupervisor` follows `DeviceSettingsStore`: one connection while `mode === 'synced'` and `activeServerUrl` is set, restarted on server switch, stopped on mode change and on quit. `status` exposes `RemoteAiWorkerStatus` (`stopped`, `idle`, `running`, `serverLocation`, `signedOut`, `noRunner`, `offline`).
- `ServerSession` (one per canonical server URL, kept by `ServerSessions` in `LocalRuntime.serverSessions`) is the single owner of the server token pair in Electron (`review-fixes`, see `review-fixes.md`). The renderer and the worker share it: the renderer goes through the `session.*` IPC channels, the worker calls it directly. Every refresh, login and logout runs through one serialized queue, so a rotated refresh token is never reused. It refreshes within 60 s of expiry or after a 401 for the token it handed out. A rejected refresh (400/401/403) clears the store and reports `expired`; a network failure keeps the store and the still-valid token. The secret key is unchanged (`renderer/session:<sha256(canonical url)>`).
- `RemoteAiJobWorker` (PeriodicRunner, 10 s, 60 s while location is `server`) claims one job at a time and loops while there is work. It claims nothing while no CLI is installed and logged in (`InstalledRunners`, cached 5 min / 1 min when none). The job's runner is used when installed, otherwise the installed one.
- `RemoteAiJobRun` gets the mail tools token, runs the `@relay/ai` runner, heartbeats every 30 s, and completes or fails the job. A lost lease, logout or stop aborts the CLI and abandons the job without settling it (the lease expires and the job is claimable again).
- `RealtimeWakeups` keeps a WebSocket to `/realtime` and wakes the worker on `ai.job.updated` (queued, local), `settings.updated` and every `welcome`. Reconnects with backoff 5 s -> 60 s.
- Wiring: `createRemoteAiSupervisor` in `apps/desktop/src/main/index.ts` (start after the background, stop before `runtime.close()`).

## Changes outside my paths (minimal)

- `packages/engine/src/ports/ai-job-repository.ts`: `QueuedAiJobQuery.userId?` and `AiJobUpdate.fromStatus?` (both optional).
- Implemented in `PgAiJobRepository`, `SqliteAiJobRepository` and the engine memory repo (`packages/engine/test/support/memory/memory-small-repositories.ts`), one condition each.
- `apps/desktop/src/main/composition/local-runtime.ts`: `LocalRuntime.aiRunners` (the registry, so the bootstrap can share it).
- `apps/desktop/src/main/index.ts`: supervisor wiring.
- `apps/server/test/ai/mail-mcp.e2e.test.ts`: tokens are job-scoped now.
- `AiJobUpdate.fromStatus` is not covered by a store-sqlite test (Pg and memory are). It is the same one-line condition.

## Tests

- engine `test/services/ai-external-worker.test.ts`: claim with thread + complete (one-liner, events, runner), wrong worker / user / kind / finished job, lease expiry + reclaim + fencing, server location.
- server `test/ai/ai-worker.e2e.test.ts` (Postgres + GreenMail): automatic one-liner claimed by a device, completed, stored on the thread, `ai.job.updated` + `thread.upserted` over realtime, another device rejected, wrong kind 400, duplicate complete 409; server location; lease expiry -> reclaim by another device, old lease fenced.
- server `test/ai/ai-worker-mail-tools.e2e.test.ts`: token needs a claimed lease of this device, read tools work, writes refused for non-chat jobs, token expires after 5 min, dies when the job ends; chat jobs may create tasks.
- server `test/ai/ai-job-fencing.test.ts` (Postgres): per-user listing, a late heartbeat does not revive a finished job.
- desktop `test/main/remote-ai-worker.e2e.test.ts` (contract stub server validating every request with the shared schemas, real secret store, real device settings store, stub `claude` executables): end-to-end run with MCP URL + job token in the CLI config, no claims without a CLI, server location / logout / mode change, lost lease abandons the run, proactive refresh stores the rotated pair for the renderer, realtime wakeup.
- desktop `test/main/remote-ai-session.test.ts`: renderer-compatible secret key, no refresh near or after expiry or after a 401, proactive refresh, no resurrection after a logout during a refresh.
- server `ai-worker-mail-tools.e2e.test.ts` also covers lease handoff and device revocation killing a device token. engine covers concurrent completions.

## Review (gpt-6.1-sol, read-only, commits `50d30c4`..`da90e36`)

The CodeRabbit CLI is not installed on this machine. A late heartbeat reviving a finished job was found and fixed before the review (`fromStatus`). The review then found 5 issues, all fixed in `45526d5`:

- High: the main-process refresh could race the renderer's own refresh and get the device revoked. Main now refreshes only in the window where the renderer never does (see above). Residual risk: a renderer refresh after a 401 that lands during main's proactive refresh. The full fix is a single token owner (request below).
- High: two concurrent completions with the same lease could both apply results. Settle first, then apply, plus a regression test.
- Medium: device MCP tokens survived lease handoff and device revocation. Now bound to the device and lease, plus a regression test.
- Medium: stopping during a pending claim still started the CLI. The run now checks the stop signal at entry and after the claim.
- Medium: an in-flight refresh could overwrite a logout. Main now compares the store before saving, plus a regression test.

No prompt-injection path beyond the existing runner protections was found: remote runs reuse the prompt wrapping, output parsing and CLI restrictions, and the server validates the output schema and kind.

## Requests / open items

- **desktop-ui / orchestrator**: show the worker status in Settings → AI. Proposed IPC channel `ai.remoteWorker.status` (input `undefined`, output `RemoteAiWorkerStatus` from `apps/desktop/src/main/ai/remote/remote-ai-worker-status.ts`), handler `() => supervisor.status`. Not done: it needs the shared IPC contract and renderer changes outside my paths.
- Done by `review-fixes`: main is the single token owner (`session.*` IPC).
- **desktop-ui**: in synced mode Settings → AI lists the server's CLIs (`api.ai.runners`). With `ai.location = 'local'` it should list this machine's CLIs (`ai.detectRunners` IPC), because those run the jobs now.
- The renderer still has no way to run `ai.run` streaming in synced + local mode; it creates server jobs and waits for `ai.job.updated` (latency now ~1 s with realtime wakeups).
