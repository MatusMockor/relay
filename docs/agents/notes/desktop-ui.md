# desktop-ui

Owner of `packages/ui/**` and `apps/desktop/src/renderer/**`.

## Status

Done for the MVP scope. Renderer lint, typecheck and tests are green, `@relay/desktop` full `typecheck` + `test` green (84 tests incl. desktop-main), `dev:web` serves and every renderer module transforms.

## Ready for others

### `@relay/ui` (`packages/ui`)

- `@relay/ui/styles.css`: tokens (`tokens.css`, exact prototype palette, Inter + JetBrains Mono, sizes, radii), base, controls, overlays. Fonts are bundled via `@fontsource/inter` and `@fontsource/jetbrains-mono` (the renderer CSP blocks Google Fonts).
- Components: `Icon` / `FolderIcon` / `Spark` (inline SVG sets from the prototype), `Kbd`, `Avatar` (+ `initialsOf`, `colorIndexOf`), `AccountDot`, `AccountSquare`, `Button`, `IconButton`, `Switch`, `Segmented`, `Tabs`, `Status`, `Field`, `Toast`, `Overlay`, `Sheet`, `Popover`, `ConfirmDialog`, `ResizeHandle`, `cx`.
- Key layers: `pushLayer`, `useLayer`, `hasOpenLayer`, `resetLayers`. Every overlay registers a capture-phase key handler, the top one wins; the app keyboard manager ignores keys while a layer is open.

### Renderer (`apps/desktop/src/renderer/src`)

- `data/MailClient.ts`: `MailClient` (segregated into `ThreadReader`, `AccountManager`, `Composer`, `Organizer`, `AiAssistant`) plus `ThreadListParams`, `TaskListParams`, `CreateDraftInput`.
- `data/remote`: `HttpApi` (typed `call(endpoint, request)` over `api`, bearer auth, single-flight refresh on 401 or expiry, `MailClientError` from the shared error shape), `RealtimeConnection` (hello/welcome, events, exponential reconnect, refresh on `unauthorized`), `RemoteAiRuns` (POST `/ai/jobs` + `ai.job.updated` + polling fallback), `createRemoteMailClient`, `ServerApi` (register, login, logout, me, devices, Google OAuth start), `checkServerHealth`, `normalizeServerUrl`, `TokenStore` / `MemoryTokenStore` / `SecureTokenStore` (`secure.*` IPC, key `session:<host>`).
- `data/local/LocalMailClient.ts`: every `local.*` channel, `local.events` stream, `ai.run` stream, `ai.detectRunners`.
- `data/demo`: `createDemoMailClient` with the prototype sample data (3 accounts, splits Jira / Klienti / Ostatné, labels, tasks, drafts, a scheduled send, an HTML newsletter with a remote image). Used under `dev:web` when "Pokračovať bez účtu" is picked in a browser.
- `data/hooks`: TanStack Query hooks per use case, `useThreadAction` (optimistic, rollback on error), `applyRealtimeEvent` (realtime events update the cache), `useRealtimeSync`.
- `session`: `SessionController` (boot, welcome / server / auth / account steps, local mode, synced mode, server switching, logout) on a Zustand `useSessionStore`.
- `platform`: `Platform` port with `createElectronPlatform` (IPC) and `createBrowserPlatform` (localStorage device settings, in-memory tokens).
- Screens: shell with resizable + collapsible panels (widths persisted to `DeviceSettings.panelWidths`, collapse state + right tab in localStorage), account switcher, folder sidebar, split tabs, list with AI one-liners and day groups, thread view (summary + checklist, collapsed earlier messages, sandboxed HTML iframe, remote images blocked until "Zobraziť obrázky", reply suggestions 1-3), right panel (Kontakt / AI chat / Kalendár placeholder agenda), reply composer (Od, Upraviť s AI, confirm + 5 s undo send, Esc saves draft), new mail sheet (Od, Komu autocomplete, Napísať s AI, schedule, drafts), reminders popover with Slovak time parsing, command palette, `?` sheet, keyboard manager (j/k, Enter, Esc, e, h, r, c, z, /, a, i, [, #, Tab, 1-3, g-sequences, Ctrl/Cmd+K, Ctrl/Cmd+, , Ctrl/Cmd+1..9, Alt+1..3), toasts with undo, Inbox Zero, onboarding, Settings (Server, Účet, Zariadenia, Účty, Split Inbox, Synchronizácia, Notifikácie, AI, Vzhľad, Klávesové skratky) with "Synchronizuje sa" / "Len toto zariadenie" badges.

## Tests

`pnpm --filter @relay/desktop exec vitest run src/renderer` (8 files, 24 tests) and `pnpm --filter @relay/ui test` (5 tests):

- `test/mail-flows.test.tsx`: j/k, Enter, Esc, g-sequences, Tab, palette, `?`, done + undo, snooze with "zajtra 9:00".
- `test/compose-flows.test.tsx`: new mail with confirm then visible in Odoslané, reply confirm cancel + undo restores the composer, suggestion key, sandboxed HTML with blocked images.
- `test/onboarding.test.tsx`: server URL validation against `GET /health`, register validation, device name/platform, device settings saved, IMAP auto-fill, test connection, account create.
- `test/settings.test.tsx`: server switching between two servers with their own tokens, devices list + revoke.
- `test/remote-mail-client.test.ts`: typed calls, refresh flow, error shape, WS realtime + reconnect, AI job completion.
- The tiny HTTP + WS server lives in `test/support` (contract-driven defaults, minimal RFC 6455 framing, no new dependency).

## Review

CodeRabbit CLI is not installed on this machine. gpt-6.1-sol (`codex exec -s read-only`) reviewed `packages/ui` + the renderer and reported 9 findings, all fixed:

- one shared `HttpApi` per server session (no parallel refresh of a rotating refresh token at startup);
- `SessionController.addTeardown`: on every session transition the chat is reset (running AI runs stopped) and pending undo-window sends are flushed through the old client before it is disposed, also before logout;
- failed sends keep the exact content as a draft;
- thread action rollback restores only the affected thread, actions are serialized per thread;
- refresh clears tokens only on 400/401/403, temporary 5xx/429 keep the session;
- remote-image consent is per message (`key` on the message view);
- secure token keys are `session:<sha256 of the canonical URL>`, browser tokens keyed by canonical URL (http and https never share a session);
- existing drafts are sent and scheduled with `source: 'draft'`.

## Requests

- **orchestrator / shared**: `DEFAULT_USER_SETTINGS.notifications` is `'urgent'`, the product rule is "Notifikácie default off". Proposed: `'off'`.
- **orchestrator / shared + desktop-main**: an IPC channel for Google OAuth, e.g. `'oauth.google.authorize': invokeChannel(z.object({ loginHint: EmailAddressSchema.optional() }), z.discriminatedUnion('kind', [z.object({ kind: z.literal('account'), account: MailAccountSchema }), z.object({ kind: z.literal('grant'), grant: OAuthGrantSchema })]))`. The renderer currently uses the server web flow (`GET /oauth/google/start` + open in browser + poll accounts) in synced mode and shows a toast in local mode. Hook: `features/accounts/use-google-oauth.ts`.
- **desktop-main**: renderer CSP `img-src 'self' data:` is inherited by the `srcdoc` mail iframe, so "Zobraziť obrázky" cannot load remote images in Electron. Proposed `img-src 'self' data: https: http:` (the iframe carries its own stricter CSP meta and is sandboxed without scripts). Also please route `window.open` from the renderer to `shell.openExternal` (used for links in mail and the OAuth URL).
- **mail-core**: expose a browser-safe subpath (e.g. `@relay/mail-core/presets`) with `providerPresets` / `guessSettings`; the renderer has its own table in `src/lib/provider-presets.ts` until then.
- **orchestrator / shared + server-api**: there is no "sync now" endpoint, `RemoteMailClient.syncNow` is a no-op. Proposed `POST /sync` with `{ accountId? }`.
- **orchestrator / shared**: checklist toggles have no API, they are device-only UI state for now.
- **orchestrator**: `pnpm-lock.yaml` changed when adding `@fontsource/inter@5.2.8` and `@fontsource/jetbrains-mono@5.2.8` to `@relay/ui`; I did not commit the lockfile (shared file).

## Decisions

- Renderer source root stays `src/renderer/src` (electron-vite convention, `index.html` loads `/src/main.tsx`), so the interface lives at `apps/desktop/src/renderer/src/data/MailClient.ts`. Renderer tests live in `apps/desktop/src/renderer/test`; `src/renderer/tsconfig.json` includes it.
- In a browser without `window.relay`, "Pokračovať bez účtu" runs the demo client; in Electron it runs `LocalMailClient` and continues to "Pridať e-mailový účet".
- Sending a reply also marks the thread done (prototype behaviour). Sends are deferred 5 s for undo, then `send` + `done` are committed.
- The main inbox tab is "Dôležité" (inbox without split); split tabs come from `GET /splits`, Úlohy shows when open tasks exist.
- Thread lists load one page of 200 items, no infinite scroll yet.

## Known gaps

- Calendar is a placeholder agenda (sample events only in demo mode).
- Visual parity was checked against the prototype CSS/markup by porting it 1:1, not by screenshots in a real Electron window.
- No "Spýtať sa AI vo veľkom okne" overlay (Shift+A opens the AI panel instead).
- Single recipient in the new mail sheet; no attachments UI.
