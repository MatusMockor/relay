# integration-desktop (agent `integration-desktop`)

Owner of `apps/desktop/**` and `packages/shared/src/ipc/**`.

## Status

Done. Everything below is committed and green (`pnpm --filter @relay/desktop lint`, `typecheck`, `test`).

- [x] IPC contract: `oauth.google.authorize` / `oauth.google.cancel` live in `@relay/shared/ipc` (`oauth-channels.ts`, merged into `ipcInvokeChannels`). `pending-channels.ts` and `main-channels.ts` are gone; the routers use the shared map.
- [x] Google sign-in: the renderer calls `oauth.google.authorize` in both modes (`features/accounts/google-sign-in.ts`). Local mode gets the account back from main. Synced mode gets `{ code, codeVerifier, redirectUri }` and posts it to `POST /accounts` (`provider: 'gmail'`). The old server web flow (`ServerApi.googleOAuthStart` + polling) is removed. A missing client id gives a Slovak message with `RELAY_GOOGLE_CLIENT_ID` and the full `google-oauth.json` path; an invalid file has its own message; a 403 from the server explains `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
- [x] CSP `img-src 'self' data: https: http:`; the mail iframe keeps its own stricter CSP. `routeExternalLinks` (`src/main/window/route-external-links.ts`) handles `setWindowOpenHandler` and `will-frame-navigate` (main frame and mail iframes); only http(s) and mailto reach `shell.openExternal`.
- [x] Sync now: `POST /sync` (synced) / `local.sync.now` (local).
- [x] Chat answers render `references` and `[thread:<id>]` markers as thread links.
- [x] Checklist ticks: `PATCH /threads/:id/checklist` (synced) / new `local.threads.updateChecklist` -> `services.checklist.update` (local).
- [x] `createTask` from the AI panel ("Vytvoriť úlohu" chip, the input text becomes the hint).
- [x] Received attachments: download buttons under each message. Synced mode uses `GET /attachments/:id/content`. Local mode calls the new `local.attachments.content` channel -> `services.attachments.content` (uploaded and received attachments, received ones fetched from IMAP).
- [x] `splitPatternPolicy` was already passed in `local-engine.ts`; `queueInMemory` is dropped.

New shared IPC channels (`packages/shared/src/ipc/local-channels.ts`):

- `local.threads.updateChecklist`: `{ threadId, item: UpdateChecklistItemBody }` -> `ChecklistResponse`.
- `local.attachments.content`: `{ attachmentId }` -> `LocalAttachmentContent` (`{ filename, contentType, contentBase64 }`).

## Requests

None open. Answered by integration-core: `oauth` namespace in `packages/shared/test/ipc.test.ts`, `services.attachments.content` + `createSqliteMessageAttachmentLookup` + `MailparserAttachmentExtractor` (wired in `local-engine.ts`, handler `handlers/local/attachment-handlers.ts`), and `@relay/mail-core/presets` (the renderer's preset table is gone; `lib/provider-presets.ts` only adds the Slovak notes and the complete-domain check).

## Review

CodeRabbit CLI is not installed on this machine. gpt-6.1-sol (`codex exec -s read-only`) reviewed `ba1d56a..HEAD -- apps/desktop packages/shared/src/ipc` and found 2 medium issues, both fixed with regression tests:

- repeated ticks of one checklist item could end in the wrong state (unordered requests, stale failure rollback): ticks are serialized per item and only the latest failure rolls back, to the last saved value;
- a cancelled Google sign-in in synced mode could still post the grant to `POST /accounts`: `signInWithGoogle` checks cancellation before posting.

A second gpt-6.1-sol pass on the fixes found 2 more (P2), both fixed: the per-item queue was keyed by item id only and lived in the component. It is now `ChecklistMutations` (`features/thread/checklist-mutations.ts`), one per `MailClient`, keyed by thread + item, surviving remounts and dropping entries when their queue drains. Tests now check server-side order with response timing, cross-thread isolation, a close/reopen case, and cancelling Google sign-in through the real hook.

## Decisions

- Synced-mode Gmail needs the same Google OAuth client on the desktop (`RELAY_GOOGLE_CLIENT_ID` / `google-oauth.json`) and on the server (`GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`): the desktop gets the code, the server exchanges it.
- `Platform` gained `authorizeGoogle`, `cancelGoogleAuthorization` and `saveFile`. In a plain browser (`dev:web`) Google sign-in fails with "Prihlásenie cez Google funguje len v desktopovej aplikácii Relay."
- Checklist ticks are no longer device-only UI state (`ui-store.checked` is gone).
- New test layer `apps/desktop/test/integration` (own `tsconfig.json`, part of `typecheck`): renders the real renderer with `createElectronPlatform` on top of the real main runtime over the in-memory IPC bridge. `vitest.config.ts` runs it with the SSR transform (`testTransformMode.ssr`, otherwise Vite rewrites `new URL(..., import.meta.url)` in store-sqlite), and `support/node-abort-globals.ts` restores Node's `AbortController` (main code passes signals to Node `fetch`, which rejects jsdom's).
