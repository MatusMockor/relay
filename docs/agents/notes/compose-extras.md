# compose-extras

## Status

Done. All scope committed and green (shared 50, engine 209, mail-core 234, server 235, desktop 321 tests; lint and typecheck clean per package).

## What exists end to end

- Recipients: To, Cc, Bcc chip inputs (`features/compose/recipients/*`). Enter, comma, semicolon, newline and paste of several addresses create chips; `Meno <a@b.sk>` is parsed; invalid addresses become red chips and block sending with `Oprav neplatnú adresu ...`; Backspace on an empty input removes the last chip; autocomplete from `useKnownContacts` skips already chosen addresses. Cc/Bcc are revealed with the `Kópia` / `Skrytá` buttons or `Mod+Shift+C` / `Mod+Shift+B`.
- Reply all (`Shift+R`, palette, thread quick actions): based on the latest message: To = its Reply-To or sender (unless the user sent it) plus its To, Cc = its Cc, own account addresses and duplicates removed (case-insensitive). Opens the full compose sheet with thread references.
- Forward (`F`, palette, thread quick actions): empty To, `Fwd:` subject, quoted header in Slovak, original non-inline attachments copied server side into the draft (`forward` returns `{ draft, attachments }` with only the copies).
- Attachments: `Priložiť` button / `Mod+Shift+A` opens the native dialog (`app.pickAttachments`), drag and drop onto the sheet, paste of files/images. Chips show name, size, `Nahrávam…` with an indeterminate bar, failures, and a remove button. Limits: 25 MB per file, 25 MB total, 50 files, checked in the renderer, in the main-process picker, in the IPC schema, on the server stream and in the engine.
- Autosave: the compose sheet saves the draft 1.2 s after edits once it has text, a subject or attachments. The first attachment creates the draft. Draft updates from the renderer never send `attachments`, the server-side list is authoritative.

## Ready for others

- Shared: `MAX_DRAFT_ATTACHMENTS_BYTES`, `MAX_DRAFT_ATTACHMENT_COUNT`, `AttachmentFilenameSchema`, `AttachmentContentTypeSchema`, `contentTypeForFilename`, `api.draftAttachments.{add,remove,forward}`, `DraftAttachmentAdded`, IPC `app.pickAttachments`, `local.drafts.attachments.{add,remove,forward}` (`ipc/attachment-channels.ts`).
- Engine: `ComposeService.getDraft`, `addDraftAttachment`, `removeDraftAttachment`, `forwardAttachments` (`DraftAttachmentService`). `DraftService.update` now deletes blobs of attachments dropped from a draft.
- Server: `POST /drafts/:id/attachments?filename=&contentType=` with a raw `application/octet-stream` body (streamed, draft ownership checked before reading, 25 MB limit by `content-length` and while streaming), `DELETE /drafts/:id/attachments/:attachmentId`, `POST /drafts/:id/forwarded-attachments`.
- Desktop main: `AttachmentPicker` (`FileDialog` port, `ElectronFileDialog`, `PickedFileReader`).
- UI: `clip` icon in `@relay/ui`.

## Decisions

- Local mode keeps blobs in the existing `FileAttachmentStore` (files next to the SQLite db), not in SQLite rows.
- Total limit is 25 MB (what Gmail and most SMTP servers accept), equal to the per-file limit.
- Forward copies the original attachments into the store on the server/main side (renderer never uploads them). Inline parts are skipped because we send text-only bodies.
- Reply drafts with more than one recipient, Cc/Bcc or attachments reopen in the compose sheet instead of the inline reply composer, so their extras are not lost.

- MIME: attachment parts are built by `packages/mail-core/src/smtp/attachment-part.ts` (passed to nodemailer as `raw`). Nodemailer encoded the last RFC 2231 continuation as a quoted plain segment and mailparser drops its leading space (`rozpočet ľščť 2027.xlsx` came back as `...ľščť2027.xlsx`). Now `name` and `filename` are always extended `*N*=` segments, content types are re-validated (no header injection), `message/*` and `multipart/*` are sent as `application/octet-stream` because they may not be base64.

## Commits

f41de66, c347ea8, 22257e9, 273a9ce, c91e352, 9873070, fcc27ec. Note: 126c709 (desktop-server-tests) had swept my real-server test into their commit and removed it again; it is committed in 9873070.

## Tests

- `pnpm --filter @relay/engine test` (test/services/draft-attachments.test.ts: add, remove, concurrent adds, limits, ownership, forward, dropped blob cleanup).
- `pnpm --filter @relay/mail-core test` (test/smtp/attachment-part.test.ts: filename round trip incl. long diacritic names, header injection, message/rfc822).
- `pnpm --filter @relay/server test` (test/attachments/draft-attachments.e2e.test.ts against Postgres + GreenMail: streamed upload, 401/404/400, oversized, remove deletes blob, delete draft deletes blobs, received MIME + Sent copy, forward; read-limited-stream.test.ts).
- `pnpm --filter @relay/desktop test` (test/main/local-draft-attachments.e2e.test.ts over IPC + SQLite + GreenMail, test/main/attachment-picker.test.ts, test/integration/real-server/draft-attachments.test.ts RemoteMailClient against the real server, renderer compose-recipients/compose-attachments tests).

## Review (gpt-6.1-sol, two passes)

Fixed: attachment list computed from a different revision than the optimistic update; cleanup deleting blobs when the reference lookup failed; send not blocked while removals/cancelled uploads settle; forward placeholder removal not cancelling; reply-all using an older inbound message; forward cancel deleting unrelated uploads; failed cancel-removals silently hidden; settle counter leak when draft creation fails; `message/rfc822` base64; upload stream premature close/listener cleanup; draft deletion racing a concurrent upload (now `deleteRevision` with retry).

Rejected or deferred:

- "Stale attachment lists from API clients (PATCH /drafts) can drop attachments": the renderer never sends `attachments` on updates any more (only the dedicated endpoints change them); PATCH keeps last-writer-wins semantics of the existing contract. Adding a client revision to `UpdateDraftBody` is a contract change for the orchestrator to decide.
- "Removing an attachment while the draft is being sent can delete a blob the send is reading": the send then fails with not_found and the draft is kept, so nothing is lost silently; blocking edits during a send claim needs the claim exposed on `Draft` (server-flaky area).
- "Cleanup failures leave orphans without retry": logged; a periodic sweeper of unreferenced blobs needs a new store port + jobs in both modes. Deferred, see gaps.

CodeRabbit: CLI not installed in this environment (`coderabbit: No such file`), not run.

## Requests

- Orchestrator: decide on an unreferenced-blob sweeper job (server pg-boss + desktop due-work) that would also clean blobs from the legacy `POST /attachments` path and from account removal.
- I ran Prettier once over `apps/desktop/src/renderer/src`, which may have reformatted calendar's uncommitted renderer files at that moment (CalendarPane etc.). Prettier output is idempotent, so content is unchanged.

## Known gaps

- Removing a mail account cascades its drafts in the database without deleting their blobs (pre-existing).
- The legacy `POST /attachments` and `local.attachments.upload` still create unattached blobs; the new UI does not use them.
- No byte-level upload progress (fetch has no upload progress, IPC is one call); chips show an indeterminate state.
- Inline reply composer stays single-recipient without attachments; reply all and drafts with extras use the compose sheet.
- Manual Electron E2E not run (native dialog, real drag and drop from the OS).
