# e2e-batch2

## Status

Manual E2E of the batch (compose extras, attachments, calendar, feeds, Google calendar setup) in the real Electron app on Linux (Xvfb, CDP), local mode against GreenMail and synced mode against the real server. Bugs found are fixed with regression tests; see commits below.

## How it was run

- Xvfb 1600x1000, `electron-vite dev` with an isolated profile (`XDG_CONFIG_HOME` / `XDG_DATA_HOME` per profile), `RELAY_DEV_ALLOW_PLAINTEXT_MAIL=1`, `RELAY_CALENDAR_FEEDS_ALLOW_PRIVATE_NETWORKS=true`, `NODE_EXTRA_CA_CERTS=<private CA>` (local mode has no CA flag, Node's extra CA works in the Electron main process).
- Driven over CDP (`Runtime.evaluate`, `Input.dispatchKeyEvent`, `Input.insertText`, `Input.dispatchDragEvent` with real file paths for drag and drop, synthetic `ClipboardEvent` for paste). The native GTK picker was driven with XTest (ctypes over libXtst).
- Synced mode ran the server from a clean `HEAD` worktree plus these fixes against its own database, because another agent was editing calendar files and adding migrations in the shared checkout at the same time.
- Feeds: local HTTPS server with a self-signed CA (`CALENDAR_FEEDS_CA_FILE` + `CALENDAR_FEEDS_ALLOW_PRIVATE_NETWORKS=true` on the server).

## Bugs fixed

1. Electron main crashed at startup (`ERR_MODULE_NOT_FOUND .../packages/calendar/src/expand/...`): the main bundling exclude list was hard-coded and missed `@relay/calendar`. Now derived from the `@relay/*` dependencies in `package.json` (`apps/desktop/workspace-packages.ts`), test asserts every `@relay/*` import of main/preload is bundled.
2. Data loss: zod 4 applies `.default([])` inside `.partial()`, so `UpdateDraftBodySchema = DraftContentSchema.partial()` turned every draft update without `attachments` (all renderer autosaves) into `attachments: []`; the engine then released the blobs. Both modes (IPC and HTTP). New `DraftContentPatchSchema`. Tests: shared schema, server HTTP e2e, desktop IPC e2e (all fail without the fix).
3. Compose autocomplete empty after the session services were replaced while the shell stayed mounted (StrictMode boot runs twice in dev; server switch in production): mounted `useQuery` observers kept the old QueryClient, new consumers got a new empty one. The provider subtree is now keyed per client.
4. A known contact showed as "nový kontakt" (a later unnamed occurrence overwrote the named one, case-sensitive keys). Suggestions also skip addresses already used in another recipient field.
5. Invitations showed a nameless "príloha" chip for the `text/calendar` body alternative. Such parts are now `inline` (indices unchanged).
6. A Vite full reload in dev opened the system browser with the app URL (main-frame navigation guard treated the app's own URL as external). Main-frame navigations to the exact app document (protocol, host, path; query and hash may differ) are allowed now (`window/app-document.ts`); `blob:` and other paths of the dev origin stay blocked.
7. Copy/layout: "1 účty" -> "1 účet" (`accountCount`), "Skrytá kópia" label no longer wraps, suggestion dropdown aligned with the inputs.

## Verified working

Recipient chips (typing, comma, paste of several, invalid chip blocks sending, Backspace), Cc/Bcc reveal (buttons and shortcuts), drag and drop and paste of files, native picker, limits with Slovak toasts, send with diacritic filenames and correct content types, Bcc not leaked, Sent copy, reply all, forward with original attachments, draft save and reopen, invitation card, RSVP REPLY to the organizer plus Sent copy, CANCEL, week strip, now line, all-day events, iCal feed add/refresh (ETag 304)/https-only/404 status in both modes, `webcal://` normalization, Google setup hint with a disabled connect button in both modes, keyboard shortcuts. No renderer console errors or main/server warnings apart from the expected 404 feed warning.

## Review (gpt-6.1-sol)

- No findings for the draft schema, bundling, known contacts, calendar inline flag, copy/layout.
- Fixed (medium): the first navigation fix reused the IPC trusted-sender predicate, which trusts the whole dev origin incl. `blob:http://127.0.0.1:5173/...`; replaced by an exact app document predicate with negative tests.
- Rejected (medium): "remounting the tree on a services change drops an open compose". A services change means another backend (local/server switch, other server, re-login); a draft bound to an account of the old backend cannot be saved through the new one, and before the fix the sheet kept stale observers and saved through the new client with the old account id.
- Deferred (low): the workspace-packages test matches single-quoted `from` imports only (the codebase uses only those, Prettier enforces single quotes).
- Not changed: the IPC trusted-sender predicate also accepts `blob:` frames of the dev origin (pre-existing, dev only).

## Remaining issues (not fixed)

- Copy register is mixed: Google calendar UI and messages, OAuth errors and the new-mail notification use formal "vy" ("Pripojte", "Nastavte", "Máte 1 novú správu"), the rest of the app uses "ty". Needs a product decision; `google-messages.ts` was being edited by another agent.
- The account form's "Názov účtu (napr. Práca)" becomes the From display name and the iMIP ATTENDEE CN.
- Forward uses the latest message of the thread; when it is the user's own reply, the original attachments are not offered.
- The Sent copy has no Bcc header, so the user cannot see whom they Bcc'd.
- A feed URL that returns 404 is still saved (shown with status "Chyba").
- `@relay/calendar` typecheck fails on test fixtures missing the new `revision` field from the concurrent calendar commits (not part of this work).
