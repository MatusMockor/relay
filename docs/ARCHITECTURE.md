# Relay - architecture

AI-native mail client in the spirit of Superhuman. Desktop app for macOS and Linux, optional sync server, AI that runs either on the server or locally on the user's machine through the user's own Claude Code / Codex CLI subscription.

## Product modes

| Mode       | Who uses it     | Where data lives                                          | Mail sync                                     | AI                                        |
| ---------- | --------------- | --------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| **Local**  | no registration | SQLite on the device                                      | desktop main process talks IMAP/SMTP directly | local CLI only                            |
| **Synced** | registered user | Postgres on the server, local SQLite cache on each device | server syncs 24/7 (IMAP IDLE)                 | server worker or local CLI (user setting) |

- The user picks the mode on first launch: "Pokračovať bez účtu" (local) or "Pripojiť k serveru" (server URL + register/login).
- The server URL is a per-device setting and can be changed in Settings → Server. Multiple saved servers are allowed.
- In synced mode everything except device-only preferences (window size, panel widths, selected account, server URL) is stored on the server and pushed to all signed-in devices in real time.
- The server is multi-user from day one: every row is owned by a `userId`. Today it runs on the owner's Linux box, later anyone can self-host it.

## High-level diagram

```
apps/desktop (Electron)
  renderer (React)  ── MailClient interface ──┬── RemoteMailClient ── HTTPS + WebSocket ──► apps/server (NestJS)
                                              └── LocalMailClient  ── IPC ──► main process
  main process: LocalEngine = @relay/engine + @relay/store-sqlite + @relay/mail-core + @relay/ai (local runner)

apps/server (NestJS, Docker Compose on the owner's Linux, optional Cloudflare Tunnel)
  auth/devices · mail accounts · sync scheduler (pg-boss) · REST API · WS gateway · AI worker
  = @relay/engine + Postgres repositories + @relay/mail-core + @relay/ai (server runner) + @relay/mcp-mail (HTTP)
```

## Monorepo layout

```
apps/
  desktop/        Electron app: main, preload, renderer (React)
  server/         NestJS API + workers
packages/
  shared/         domain types, zod schemas, API contract, WS events (no runtime deps besides zod)
  engine/         application services + repository/provider PORTS (interfaces); pure TS, no I/O
  store-sqlite/   SQLite (better-sqlite3 + Drizzle) implementations of engine repository ports
  mail-core/      MailProvider adapters (IMAP via imapflow, Gmail via XOAUTH2), SMTP sender, MIME parsing, threading, Jira classifier
  ai/             AiRunner port + Claude Code / Codex CLI runners, CLI detection, prompts, output parsing
  mcp-mail/       MCP server exposing mail tools backed by engine ports (stdio + streamable HTTP)
  ui/             design tokens and React components (ported from the approved prototype)
  config/         shared tsconfig / eslint / prettier / vitest presets
```

Dependency rule (enforced by ESLint import boundaries):

```
shared  ◄── engine ◄── store-sqlite
   ▲           ▲  ◄── mail-core (implements engine MailProvider/MailSender ports)
   │           ▲  ◄── ai        (implements engine AiRunner port)
   │           ▲  ◄── mcp-mail
   ├── ui
   └── apps/* may depend on any package; packages never depend on apps
```

`engine` depends only on `shared`. Everything with I/O lives outside `engine` and is injected.

## Hexagonal core (`@relay/engine`)

- **Ports** (interfaces, one per file) in `engine/src/ports/`:
  - repositories: `AccountRepository`, `MailboxRepository`, `MessageRepository`, `ThreadRepository` (folder-view query with cursor pagination, unified or per account), `LabelRepository`, `SplitRepository`, `AutomationRepository`, `AutomationRunRepository`, `TaskRepository`, `ReminderRepository`, `DraftRepository`, `ScheduledSendRepository`, `SettingsRepository`, `AiResultRepository`, `AiJobRepository`, `SyncStateRepository` (UIDVALIDITY / last UID / HIGHESTMODSEQ / frozen initial-sync window per mailbox). User-facing methods take the `UserId` first; sync-internal methods are keyed by account or mailbox.
  - `UnitOfWork.run(work)` passes transaction-bound `Repositories` to `work`.
  - mail: `MailProvider`, `MailProviderFactory`, `MailSender`, `UnsubscribeSender` (RFC 8058 one-click POST), `CredentialVault`, `AttachmentStore`, `MessageParser`, `ThreadResolver`, `JiraClassifier`, `SplitMatcher`, `AutomationMatcher`.
  - AI: `AiRunner` (`run(request): AsyncIterable<AiEvent>`), `AiRunnerRegistry`.
  - infrastructure: `EventPublisher`, `Clock`, `IdGenerator`, `Logger`.
- Engine-internal types (raw/parsed messages, sync cursors, pages, AI requests) live in `engine/src/model/`. They never cross the wire.
- `PORT_TOKENS` (`engine/src/tokens.ts`) gives every port a `Symbol.for('relay.engine.<Port>')` token, used by Nest providers and the desktop composition root.
- `EngineError` subclasses (`NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`, `ProviderError`, `NotImplementedError`) carry an `ApiErrorCode`; HTTP and IPC adapters map them to the shared error shape.
- **Application services** in `engine/src/services/`, one use case family per file: `SyncService`, `InboxQueryService`, `ThreadQueryService`, `MessageActionsService` (done, undo, trash, read/unread, label, pin), `ReminderService`, `ComposeService`, `TaskService`, `SplitService`, `AutomationService`, `AiService`, `UnsubscribeService` (parses the stored `List-Unsubscribe` / `List-Unsubscribe-Post` headers into https or mailto options and sends one-click unsubscribes).
- All database access goes through repository ports. No service, controller or IPC handler talks to Drizzle directly.
- Server implements the ports with Postgres + Drizzle; local mode implements them with SQLite + Drizzle (`store-sqlite`). The same services run in both places.

## Domain model (see `packages/shared/src/domain`)

`User`, `Device`, `MailAccount` (provider: `imap` | `gmail` | `outlook`, color, isPrimary, sync interval, status), `ImapSmtpSettings`, `AccountCredentials` (password or OAuth tokens, never sent to clients), `Mailbox` (role: inbox, sent, drafts, trash, archive, spam, custom), `Message`, `ThreadSummary` / `ThreadDetail`, `ThreadAction`, `Label`, `Split` (rule-based view of the inbox), `Automation` (rule that runs actions on new mail), `Task` (one per Jira issue or created by AI), `Reminder`, `Draft`, `ScheduledSend`, `AiJob` / `AiResult` / `AiEvent`, `UserSettings` (synced), `DeviceSettings` (device-only), `FolderView`.

- Ids are branded strings (`UserId`, `ThreadId`, ...) and timestamps are ISO 8601 strings with offset, so the same types work over HTTP, WebSocket and IPC.
- A `Split` matches a message when any of its rules matches. `accountId: null` means the split applies to the unified inbox. An `exclusive` split removes matching threads from the main inbox.
- An `Automation` runs when all of its conditions match a new inbox message (split rule conditions plus the Jira event kind). Actions: AI summary, AI-judged task, notification, mark read, pin (IMAP `\Flagged`), archive. Each rule picks its AI runner, a model and effort from the static catalog in `shared/src/domain/ai-model-catalog.ts`, and optional instructions. Rules never run on the initial sync backlog, and `AutomationRunRepository` records each automation and message pair so a rule fires at most once per message. The seeded `Jira tasky` preset keeps the classic Jira task behavior (create or reopen by Jira key without AI) until the user adds instructions or turns it off.

"Done" = archive (IMAP move to archive mailbox / Gmail remove INBOX label). Read state, done, trash and labels are mirrored back to the mail provider so other clients see them too.

## Server (`apps/server`)

- NestJS 11 with the Fastify adapter, modules per bounded context: `auth`, `devices`, `accounts`, `sync`, `mail` (threads/messages/actions), `tasks`, `settings`, `ai`, `realtime`, `health`.
- Postgres 17 + Drizzle ORM, migrations with drizzle-kit. Repositories implement engine ports; Nest providers bind port tokens to implementations (dependency inversion).
- Jobs: pg-boss (sync per account, reminders, scheduled sends, AI jobs). No Redis.
- Auth: email + password (argon2id), optional TOTP later. Access JWT (15 min) + rotating refresh token bound to a `Device`. Devices can be listed and revoked.
- Mail credentials encrypted at rest (AES-256-GCM, key from `CREDENTIALS_ENCRYPTION_KEY`).
- Realtime: WebSocket gateway on `/realtime`. The client sends `hello` (`apiVersion`, access token) first; the server answers `welcome` and then pushes `event` messages carrying a `RealtimeEvent`: `thread.upserted`, `thread.removed`, `message.upserted`, `task.upserted`, `account.status`, `account.upserted`, `account.removed`, `draft.upserted`, `draft.removed`, `scheduledSend.upserted`, `splits.updated`, `automations.updated`, `automation.notified`, `ai.job.updated`, `settings.updated`, `sync.progress` (`shared/src/realtime`).
- API contract lives in `shared/src/api`: every endpoint is `{ method, path, auth, params?, query?, body?, response }` built from zod schemas and grouped by area in `api`. The server validates requests with `parseEndpointRequest`; clients build URLs with `buildUrl` and are typed by `EndpointRequest` / `EndpointResponse`. Errors use `{ error: { code, message, issues? } }` (`ApiErrorCode` -> HTTP status in `API_ERROR_HTTP_STATUS`), lists use cursor pagination (`{ items, nextCursor }`).
- Dev runtime: `vite-node` with SWC (decorator metadata) runs `src/main.ts` directly from TypeScript, the same pipeline Vitest uses. A production bundle is still to be decided.
- Deploy: `docker compose up` (server + postgres). Optional Cloudflare Tunnel for remote HTTPS access without open ports. Cloudflare Access is not used because the app has its own login.

## Desktop (`apps/desktop`)

- Electron + electron-vite + React 19 + TanStack Query + Zustand. Same look on macOS and Linux.
- `renderer` only knows the `MailClient` interface (`apps/desktop/src/renderer/data/MailClient.ts`). `RemoteMailClient` uses HTTP + WS, and `LocalMailClient` uses typed IPC to the main process.
- IPC contract lives in `shared/src/ipc`: a channel map of zod schemas (`app.*`, `settings.device.*`, `secure.*`, `ai.*`, `local.*`). The preload exposes `window.relay: RelayBridge` with `invoke(channel, input)` (one Electron channel `relay:invoke`, returns `IpcResult`) and `subscribe(channel, handlers, input)` for streams (`ai.run`, `local.events`). Main validates input and output of every call (`IpcInvokeRouter`, `IpcStreamRouter`).
- `pnpm --filter @relay/desktop dev:web` serves the renderer alone on port 5173. `window.relay` is then absent and the renderer must handle it.
- Windows run with `contextIsolation`, `sandbox` and no Node integration; the preload is bundled as CommonJS. CSP is injected into the built `index.html`.
- `main` hosts the `LocalEngine` for local mode, secure storage (Electron `safeStorage`) for tokens and local credentials, the local AI runner, and native features (tray, notifications, global shortcuts) and auto-update (`electron-updater` behind the `AppUpdater` port, packaged macOS and AppImage only, see `docs/operations/release.md`).
- HTML mail is rendered in a sandboxed iframe (no scripts, remote images blocked by default).
- UI follows the approved prototype `design/prototype/app-a.html` (dark tokens, Inter + JetBrains Mono, split inbox, folder sidebar, right panel with Kontakt / AI / Kalendár, resizable panels, multiple accounts, command palette, keyboard-first).

## AI (`@relay/ai`)

- `AiRunner` port: `run(request: AiRequest): AsyncIterable<AiEvent>` (`AiEvent` is defined in `shared` so it can be streamed over IPC unchanged). Implementations: `ClaudeCodeRunner` (`claude -p --output-format stream-json`) and `CodexRunner` (`codex exec --json`), each spawning the CLI with a mail MCP server attached.
- Runner location is a user setting: `server` (server AI worker uses the CLIs installed on the server) or `local` (the desktop main process uses the CLIs installed on this machine). Like T3 Code environments.
- `CliDetector` reports which CLIs are installed and logged in on the current machine, shown in Settings → AI.
- Tasks: one-line summary, thread summary + checklist, reply suggestions, rewrite draft, free-form chat over mail, create task from mail, automation task verdict (`automationTask`). Jobs can carry a per-job model and effort that the CLI dialects pass on (`--model`, Claude `--effort`, Codex `-c model_reasoning_effort`).
- Safety: the agent gets read-only mail tools plus `create_task`/`create_draft`. Sending always needs explicit user confirmation in the UI. Email content is untrusted input (prompt injection).

## Mail providers (`@relay/mail-core`)

- `ImapMailProvider` (imapflow): folders, incremental fetch by UID/MODSEQ, IDLE, flags, move, append.
- Gmail: OAuth 2 (desktop loopback + PKCE in local mode, server web flow in synced mode) then XOAUTH2 over IMAP/SMTP. Needs a Google Cloud OAuth client ID configured via env/settings.
- Outlook / Microsoft 365: same pattern, later.
- `SmtpMailSender` (nodemailer). `HttpsUnsubscribeSender` posts RFC 8058 one-click unsubscribes to public https URLs only: it resolves the host once, denies every non-global address (including IPv4 embedded in IPv6), pins the connection to the validated IP while keeping the Host header and SNI, and never follows redirects, from the desktop main process in local mode and from the server in synced mode, never from the renderer.
- `MimeParser` (mailparser). `ThreadBuilder` (Message-ID / References / In-Reply-To). `JiraClassifier` (sender + headers + subject patterns, outputs split + task events).

## Tooling

- Internal packages are consumed as TypeScript source (`exports` -> `src`, `moduleResolution: Bundler`, extensionless imports). Vitest, electron-vite and vite-node resolve them, so there is no build step for development or tests.
- Versions are pinned exactly. Native modules (`better-sqlite3`, `argon2`) are allowed to run install scripts via `onlyBuiltDependencies` in `pnpm-workspace.yaml`.

## Engineering standards

See `CLAUDE.md` at the repo root. Short version: TypeScript strict, SOLID, repositories for all persistence, small focused files, guard clauses (no `else`), no code comments, Prettier + ESLint, Vitest integration tests against real infrastructure (Postgres and GreenMail in Docker), mocks only at true third-party boundaries.
