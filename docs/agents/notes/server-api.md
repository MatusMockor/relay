# server-api - coordination note

Owner of `apps/server/src/**` (except `src/persistence/**`, `src/core/**`), `apps/server/test/**` (except `test/persistence/**`), `apps/server/package.json`, `apps/server/Dockerfile`, `deploy/**`.

## Status

DONE except the received-attachment download (waits on two requests below).

- `pnpm --filter @relay/server lint` / `typecheck` green; `pnpm --filter @relay/server test` 27 files / 107 tests green (my e2e: 9 files / 24 tests, the rest are server-data's persistence tests).
- Docker image built and started against a fresh Postgres database: migrations ran, `/health` answered.

## What is built

Every endpoint of the shared contract is implemented (`@ApiRoute(endpoint)` takes method/path/auth from `api.*`; `@ApiRequest(endpoint)` validates with `parseEndpointRequest`; `ContractResponseInterceptor` parses every response through the contract schema, so unknown fields such as credentials are stripped).

- `config/` - `EnvSchema` / `parseEnv` (empty values = unset), `toServerConfig`, `SERVER_CONFIG`. `.env.example` lists every variable.
- `http/` - `ApiExceptionFilter` + `mapApiError`: `ApiException`, `EngineError` codes, Nest/Fastify HTTP errors -> `{ error: { code, message, issues? } }` with `API_ERROR_HTTP_STATUS`. `createFastifyAdapter()` (body limit fits a 25 MB base64 attachment).
- `auth/` - register / login / refresh / logout / me. argon2id (OWASP params, dummy verify on unknown email). Access JWT HS256 15 min (`{ sub, did, typ: 'access' }`, verified against `Clock`). Refresh tokens are 32 random bytes, stored as HMAC-SHA256, rotated on every refresh inside a `ServerUnitOfWork`. Presenting a rotated token (or losing a rotation race) revokes the family and the device. Global `JwtAuthGuard` (also rejects tokens of revoked devices), `@Public()`, `@CurrentPrincipal()`. `REGISTRATION_ENABLED=false` -> 403.
- `devices/` - list (with `current`), revoke (revokes refresh tokens and closes the device's WebSocket connections).
- `realtime/` - `ws` on the Fastify HTTP server `upgrade` for `/realtime`. `hello` (access token) -> `welcome`, app `ping`/`pong`, ws ping heartbeat (30 s), 10 s hello timeout, 64 KB max payload, per-user fan-out from `DomainEventBus`.
- `events/` - `DomainEventBus` (Observer) + `BusEventPublisher` bound to `PORT_TOKENS.EventPublisher`.
- `infrastructure/` - `SystemClock`, `RandomIdGenerator`, `NestEngineLogger` on `PORT_TOKENS.Clock | IdGenerator | Logger`.
- `mail/` - mail-core adapters on the engine mail ports, `RefreshingOAuthTokenProvider` with the Google refresher, `GoogleCodeExchanger` (`OAUTH_CODE_EXCHANGER`). `MAIL_ALLOW_PLAINTEXT` (default `false`, tests only) is passed to IMAP and SMTP.
- `engine/` - `EngineModule` builds `createEngineServices(...)` from the port tokens and exposes each service by its class (`AccountService`, `InboxQueryService`, `ThreadQueryService`, `MessageActionsService`, `ReminderService`, `TaskService`, `SyncService`, `ComposeService`, `SplitService`, `AiService`, `SettingsService`, `LabelQueryService`). Options: `aiRunnerLocation: 'server'`, `ai.queueInMemory: false`, `ai.mailTools` = per-job resolver.
- Controllers: `accounts/` (IMAP via `createImap`; Gmail: the desktop sends `{ code, codeVerifier, redirectUri }`, the server exchanges it with the configured Google client and calls `createOAuth(..., verify: false)`; Outlook -> 501; a sync job is queued after create), `threads/`, `labels/`, `tasks/`, `splits/`, `settings/`, `compose/` (drafts, send, scheduled), `attachments/` (upload + `GET /attachments/:id/content` for uploaded attachments), `ai/` (jobs, runners), `health/`.
- `ai/` - `AiRuntimeModule` (`createCliRunnerRegistry({ location: 'server' })`, `AI_CLI_PATH` restricts the CLI search path). `POST /ai/jobs` -> `ai.createJob` -> pg-boss `ai-job` when the job is a server job -> `ai.runJob`. `POST|GET|DELETE /mcp` mounts `createMailMcpHttpHandler` with a 15 min `MailToolsTokenService` token (HS256, audience `relay-mail-mcp`); `ServerMailToolsResolver` hands the runner `{ transport: 'http', url: 'http://127.0.0.1:<port>/mcp', headers: { Authorization } }`.
- `jobs/` - `JobQueue` port with `PgBossJobQueue` (same Postgres, schema `pgboss`, queues created lazily, `notifyWorker` after send) and `NoopJobQueue` (`JOBS_ENABLED=false`). Queues: `sync-account` (stately, keyed by account), `due-reminders`, `due-scheduled-sends` (stately), `ai-job`. `JobTicker` (`JOBS_TICK_MS`) runs `SyncScheduler.tick()` (honors `syncIntervalSeconds` against `lastSyncedAt` and the last request) and enqueues the due-work jobs. `ImapIdleManager` keeps one IDLE per syncable account (starts on boot, follows `account.upserted` / `account.removed`, lifecycle serialized per account), triggers `sync-account` on change, exponential backoff 1 s -> 5 min on failures.
- `deploy/` - `apps/server/Dockerfile` (multi-stage, pnpm filtered install, runs `vite-node` from TS source as `node`, healthcheck, optional `INSTALL_AI_CLIS`), `Dockerfile.dockerignore`, `deploy/docker-compose.yml` (postgres 17 + volume, server, healthchecks, `restart: unless-stopped`, `cloudflared` under the `tunnel` profile), `deploy/.env.example`, `deploy/README.md` (home Linux box, secrets, Cloudflare Tunnel without Access, Gmail client, AI CLIs, backups).

## Tests (`apps/server/test`)

Real HTTP on a random port, a fresh Postgres database per file (`createTestDatabase`), GreenMail users per test via the REST API, `ManualClock` bound to `PORT_TOKENS.Clock`. Third parties stubbed only: Google token endpoint (local `node:http`), `claude` CLI (stub executable).

- `auth/` - register, second-device login, refresh rotation, reuse detection revoking the family, device revoke, logout, 15 min expiry by clock, closed registration, error shapes.
- `realtime/` - hello/welcome, ping/pong, per-user fan-out, invalid token / invalid hello, oversized frame, revoked device closes the socket.
- `mail/` - add two GreenMail accounts -> sync -> unified and per-account inbox -> IDLE picks up a new message (verified to fail with IDLE off) -> `done` moves to GreenMail `Archive` -> WS `thread.upserted` -> reply over SMTP lands in GreenMail -> reminder fires after a clock jump -> scheduled send goes out after a clock jump.
- `accounts/` - test-connection ok/failure, CRUD, duplicate 409, ownership 404, Gmail grant exchange (params checked at the stub), bad code 502, missing verifier 400, settings patch + `settings.updated`.
- `ai/` - runners report the stub CLI, a server job runs through pg-boss to `done` with `ai.job.updated` and the MCP config pointing at `/mcp` with a bearer token, local jobs stay queued; `/mcp` token checks.
- `splits/`, `health`, `env`.

Helpers for others: `test/support/test-app.ts` (`startTestApp({ env })`), `api-client.ts` (contract-typed `ok` / `fail` / `raw`), `realtime-client.ts`, `greenmail.ts`, `mail-flow.ts`, `auth-flow.ts`, `google-token-stub.ts`, `stub-claude.ts`.

## Proposed contract addition (for the orchestrator)

### Download an attachment

Synced clients can't download attachments of received messages. Proposed addition to `packages/shared/src/api/endpoints/attachments.ts`:

```ts
import { AttachmentIdSchema } from '../../domain/ids';
import { idParamsOf } from '../common';

export const attachmentsEndpoints = {
  upload: /* unchanged */,
  content: defineEndpoint({
    method: 'GET',
    path: '/attachments/:id/content',
    auth: 'user',
    params: idParamsOf(AttachmentIdSchema),
    response: z.unknown(),
  }),
};
```

The response is raw bytes, not JSON: `Content-Type` = attachment type, `Content-Length`, `Content-Disposition: attachment; filename="<ascii>"; filename*=UTF-8''<encoded>`, `X-Content-Type-Options: nosniff`. Clients must not run it through `parseEndpointResponse`. Implemented locally as `GET /attachments/:id/content` (FLAGGED: not in the shared contract yet). Today it serves uploaded draft attachments; received ones need the two requests below.

## Requests

- **server-data**: bind the new engine port `PORT_TOKENS.MessageAttachmentLookup` (`findByAttachmentId(userId, attachmentId)`, e.g. `messages.attachments @> '[{"id": "..."}]'`) in `PersistenceModule`.
- **mail-core**: export `extractAttachment(source: Uint8Array, index: number): Promise<{ filename: string | null; contentType: string; content: Uint8Array } | null>` in the same order as `MailparserMessageParser.parse(...).attachments`.
- Once both land, the server adds a `ReceivedAttachmentSource` to `ATTACHMENT_CONTENT_SOURCES` (`src/attachments/attachments.module.ts`): lookup message -> mailbox path + uid -> `MailProvider.fetchMessage` -> `extractAttachment(raw, index of the AttachmentMeta)`.
- **orchestrator**: add the `content` endpoint above to the shared contract.
- Done by engine (thanks): `AccountService`, `ai.queueInMemory`, `ai.mailTools` resolver.
- New dev dependency: `imapflow@1.7.8` in `@relay/server` (tests only, to create folders and inspect GreenMail mailboxes).

## Decisions others must know

- Refresh token family = one login on one device. Reuse of a rotated token revokes the family and the device. Logout revokes the current device.
- Access JWT payload `{ sub: userId, did: deviceId, typ: 'access' }`, HS256, `ACCESS_TOKEN_TTL_SECONDS` (900). The guard checks the device is still active on every request.
- The server uses its own `ImapIdleManager` + pg-boss instead of `sync.watchAccount`, so syncs from IDLE and the scheduler are deduplicated by the stately `sync-account` queue.
- Gmail accounts skip the connection check at creation (`verify: false`); the token exchange already proved the grant and the first sync reports failures through `account.status`.
- `/mcp` is public at the HTTP layer and authenticates with its own short-lived tokens; normal access tokens are rejected there.

## Known gaps

- Received-attachment download (see requests).
- Google web OAuth flow (`/oauth/google/start`, `/oauth/google/callback`) is not mounted; Gmail uses the desktop grant via `POST /accounts`.
- No login rate limiting yet.
- CodeRabbit CLI is not installed on this machine; a gpt-6.1-sol review ran instead and all 6 findings (WS error handling and races, IDLE lifecycle races, compose tunnel token) are fixed.
