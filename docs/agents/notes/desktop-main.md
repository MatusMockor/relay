# desktop-main (agent `desktop-main`)

Owner of `apps/desktop/src/main/**`, `apps/desktop/src/preload/**`, `apps/desktop/package.json`, `apps/desktop/electron.vite.config.ts`, `apps/desktop/electron-builder.yml`, `apps/desktop/renderer-csp.ts`, `apps/desktop/resources/**` and `apps/desktop/test/main/**` (main-process tests).

## Status

Done. All main-process tests are green: `pnpm --filter @relay/desktop exec vitest run test/main` gives 13 files and 60 tests, including e2e against real SQLite temp files and GreenMail. Main/preload lint and `tsc --noEmit` are clean. The package-wide lint/typecheck/test still fails, but only in renderer files owned by desktop-ui.

## Layout (`apps/desktop/src/main`)

- `index.ts` - thin Electron bootstrap: single instance lock, `whenReady`, local runtime, hardened session, IPC registration, main window, native shell, mode-aware background, ordered shutdown, fatal error dialog.
- `composition/` - composition root.
  - `createLocalRuntime(input)` wires the whole local runtime and is testable without Electron.
  - `createLocalEngine` opens SQLite `userData/relay.db`, runs `migrate` with an explicit folder, then builds store-sqlite repos + `SqliteUnitOfWork`, the mail-core adapters, the vault, `FileAttachmentStore`, the hub publisher and clock/ids/logger, and calls `createEngineServices`.
  - `composeIpc(context)` registers every handler group whose deps are present and logs unexpected handler errors.
  - Other wiring: `createMailAdapters`, `createMainInfrastructure`, `createLocalDueJobs`, `createLocalSyncTrigger`, `EngineGoogleAccountConnector`.
- `handlers/` - one file per area: app, device settings, secure, oauth, ai, and `local/` (threads + labels, tasks, sync, compose, accounts, settings + splits, event stream).
- `ipc/` - `IpcInvokeRouter` / `IpcStreamRouter` (zod input and output validation, error reporter), `main-channels.ts` (shared channels + pending local channels), trusted sender check.
- `background/`
  - `AccountSyncScheduler` runs one `PeriodicRunner` per account at its `syncIntervalSeconds`.
  - `IdleSupervisor` + `IdleWorker` run IMAP IDLE via `SyncService.watchAccount`, with exponential backoff on start failures.
  - `DueWorkTicker` runs every 30 s: reminders, scheduled sends, and queued local AI jobs (only when `ai.location === 'local'`).
  - `PowerAwareLifecycle` pauses on suspend and resumes on wake.
  - `ModeAwareBackground` runs all of the above only while device mode is `local` and follows mode changes live.
  - Stop drains in-flight work, and reconciles are generation-guarded.
- `oauth/` - `startLoopbackReceiver` (127.0.0.1, random port, state checked before anything else, malformed requests answered with 400), `GoogleLoopbackFlow` (PKCE, `shell.openExternal`), `GoogleOAuthCoordinator` (one flow at a time, cancel, drain on shutdown), `EnvOrFileGoogleClientConfigSource`, `LazyGoogleTokenRefresher`.
- `secure/` - `EncryptedFileSecretStore` (safeStorage async API, file `userData/secrets.bin`, Linux `basic_text` backend counts as unavailable and fails with a clear Slovak message), `NamespacedSecretStore` (`renderer/*` for `secure.*`, `credentials/*` for the vault), `SecretStoreCredentialVault`.
- `settings/DeviceSettingsStore` - `userData/device-settings.json`, validated by `DeviceSettingsSchema`, serialized writes, `onChange`.
- `ai/`
  - `AiLocationGate` and `EngineLocalAiRuns` (`ai.run` goes through `AiService.run`).
  - `LocalMailToolsServer` hosts the `MailToolSocketHost` (0600 socket, random token) behind a `DeferredMailToolBackend`, which binds to `engineMailToolBackend`.
  - `mcp-mail-stdio.ts` is the extra electron-vite main entry (`out/main/mcp-mail-stdio.js`), run with `ELECTRON_RUN_AS_NODE=1`.
- `native/` - window bounds + state store/tracking, app menu template (macOS + Linux, standard edit roles), Electron tray with unread count + badge, `UnreadBadgeUpdater`, `NewMailNotifier` (`off` / `urgent` / `digest`, follows the user setting, only mail that arrives after start), single instance.
- `window/` - strict `webPreferences` (contextIsolation, sandbox, no node integration, no webview), external links (http/https/mailto) open in the system browser, `will-navigate` blocked, permissions denied except sanitized clipboard writes.
- `platform/` - small interfaces over Electron (`SecretCipher`, `PowerEvents`, `UrlOpener`, `Timers`) + Electron adapters.

## Ready for others

- Every channel of the shared IPC contract has a handler: `app.getInfo`, `settings.device.*`, `secure.*`, `ai.detectRunners`, stream `ai.run`, `local.threads.*`, `local.labels.list`, `local.accounts.*`, `local.sync.now`, `local.settings.*`, `local.tasks.*`, `local.splits.*`, `local.drafts.*`, `local.attachments.upload`, `local.send`, `local.scheduled.*`, stream `local.events`.
- `local.sync.now` awaits the sync and fails with `provider_error` when the account sync fails.
- **desktop-ui**: two local-only IPC channels (not in `@relay/shared` yet, call them through a cast):
  - `oauth.google.authorize`
    - Input: `{ mode: 'local' | 'synced', loginHint?: string }`.
    - Output: `{ mode: 'local', account: MailAccount } | { mode: 'synced', grant: { code, codeVerifier, redirectUri } }`.
    - Opens the system browser and waits up to 5 min.
    - Synced mode: post `grant` to `POST /accounts` as `{ provider: 'gmail', oauth: grant }`.
    - Local mode: the account is created through `AccountService.createOAuth`.
    - Fails with `validation_failed` and a Slovak message when no client id is configured.
  - `oauth.google.cancel` (input `undefined`, output `{ ok: true }`).
- Secure storage on Linux without a keyring: `secure.*` fails with code `internal` and a Slovak message.

## Requests

- **orchestrator** (shared contract): move the two OAuth channels into `appInvokeChannels` (`packages/shared/src/ipc/app-channels.ts`). The schemas are in `apps/desktop/src/main/ipc/pending-channels.ts` and can be moved as they are. Then delete `pending-channels.ts` and point `main-channels.ts` back at `ipcInvokeChannels`.
- **orchestrator** (shared default): the task says notifications are off by default, but `DEFAULT_USER_SETTINGS.notifications` is `'urgent'`. Proposal: change it to `'off'`.
- **orchestrator** (launch): the first commit touching `apps/desktop/package.json` added `zod`, `@relay/mcp-mail` (deps) and `nodemailer`, `@types/nodemailer`, `imapflow` (test devDeps). I did not commit `pnpm-lock.yaml` because other agents had uncommitted changes in it, so commit the lockfile with the final state. When launching Electron: `native:electron` for better-sqlite3. The packaged app needs `extraResources` drizzle (already in `electron-builder.yml`). The `runAsNode` fuse must stay enabled for the MCP entry.

## Decisions

- Local mode uses `LOCAL_USER_ID` (`local`) from `@relay/store-sqlite`.
- Local attachments: `FileAttachmentStore` (`userData/attachments/<id>.bin` + `.json` meta).
- Migrations folder:
  - packaged: `process.resourcesPath/drizzle`;
  - dev: `<appPath>/../../packages/store-sqlite/drizzle`;
  - tests: `SQLITE_MIGRATIONS_FOLDER`.
- Plaintext IMAP/SMTP is refused (mail-core requires STARTTLS). `allowPlaintextMail` is a runtime input that only the tests set, for GreenMail.
- The Google client id comes from env `RELAY_GOOGLE_CLIENT_ID` (+ optional `RELAY_GOOGLE_CLIENT_SECRET`) or `userData/google-oauth.json` `{ clientId, clientSecret?, authEndpoint?, tokenEndpoint? }`.
- Notifications and the tray badge only see local-mode events. In synced mode realtime goes server → renderer over WS.
- On Linux and Windows the app quits when the last window closes, so background work stops too. macOS keeps running.

## Known gaps

- Electron was never launched, and no packaging build was run (per instructions). The `?asset` imports, the second main entry and `electron-builder.yml` were checked only by typecheck and schema validation (`validateConfiguration` passes).
- `ai.run` in synced mode with `ai.location = 'local'` is not supported. The local runner reads local SQLite, not server data.
- No spawned-child test of the bundled `mcp-mail-stdio.js` (needs a build). The socket + token wiring is tested in-process, and the stub `claude` CLI test checks the generated MCP config (command, `--socket`, token).
- GreenMail accepts any password, so auth-failure paths are tested with an unreachable port instead.
- CodeRabbit CLI is not installed on this machine. Instead, a gpt-6.1-sol read-only review ran on my paths. All 8 findings were fixed, with regression tests.
