# calendar-followups agent

## Status

Items 1-5 done: `d73cfef` (durable queue, REPLY parking, back-fill, RSVP sent copy), `160519e` (MCP calendar tools), `ef720e1` (RDATE PERIOD lengths), `00080ad` (test fixture), `8753223` + `5a76659` (review fixes). gpt-6.1-sol review: see below.

## 1. Durable invitation ingestion

- `MessageIngestor.create` queues a `calendar-invite` pending-work row (ref = message id) in the SAME transaction as the message (`CalendarPartsSink.queue`). Drafts and spam are ignored as before.
- `ChangeFlusher.flush` ends with `CalendarPartsSink.flush(userId, account)` -> `InviteWorkProcessor.processDue`: every due row is applied in its own unit of work (event upserts + removal of the row, revision-checked), so a crash at any point leaves the row and it is applied on the next flush. Re-applying is idempotent through SEQUENCE/DTSTAMP precedence.
- A failure rolls back that row's transaction only and reschedules it (`invite-retry.ts`: 1 min, 5 min, 30 min, 2 h, 12 h). After the sixth failed attempt the row keeps `failedAt` + `lastError` and is never retried; other rows and the message are never blocked. Retry state lives in the JSON payload, no schema change.
- One `calendar.updated` event per flush when any published row changed something.

## 2. Back-fill of invitations synced before the feature

- What is stored locally: message rows keep attachment metadata (content type, filename) but not the attachment bytes, and the raw MIME is not stored. So the parts must be fetched again, but only for candidate messages.
- Migrations `store-sqlite 0011_calendar_invite_backfill` and `server 0013_calendar_invite_backfill` insert one `calendar-backfill` pending-work row per existing mailbox (not drafts/spam) with `afterUid: 0`. New accounts never get rows, so nothing is re-fetched for them.
- `InviteBackfill` (runs in `AccountSynchronizer` after reconcile, before the final flush, on the already open provider session) reads the rows, lists candidates through `InviteCandidateRepository.listAfter(mailboxId, afterUid, limit)` (attachment content type `text/calendar`, `application/ics`, `application/x-ics` or a `.ics` filename, UID order), fetches each candidate with `fetchMessage`, queues its calendar parts as normal `calendar-invite` work and advances the cursor in the same transaction. Budget: `CalendarOptions.inviteBackfillBatch` messages per sync (default 50). The row is removed when a mailbox is exhausted, or when the mailbox no longer exists. A provider error pauses the back-fill (logged) and the next sync resumes from the cursor.

## 3. REPLY ordering and Sent copy

- A REPLY without a stored event (or instance) is parked as `calendar-reply` pending work keyed by uid + recurrence id + attendee (only the newest per SEQUENCE/DTSTAMP is kept). When a REQUEST stores that uid + recurrence id, the parked replies are applied in the same transaction (stale ones with a lower SEQUENCE are dropped). Parked replies older than 90 days are pruned at that point.
- `RsvpService` sets `In-Reply-To`/`References` to the invitation's Message-ID and records the sent REPLY through the compose `SentMessageRecorder` (Sent append + ingest, Gmail skipped as before, failures logged without failing the RSVP). The sent copy's own REPLY part goes through the normal queue and is idempotent.

## 4. MCP calendar tools

- `list_events` (`from` ISO with offset, default now; `days` 1-31, default 7; `limit` 1-200, default 50; cancelled occurrences skipped) and `get_thread_events` (`threadId`). Both read-only, results carry `timeZone`, the untrusted notice, and all times as wall time with offset in that zone (`presenters/zoned-time.ts`; all-day events as dates).
- `MailToolBackend.listEvents` / `getThreadEvents`, socket methods `listEvents` / `getThreadEvents` (zod params + results on both sides), `engineMailToolBackend(services, userId, timeZone: () => string)` now needs `calendar` in the services and a zone provider.
- Zones: desktop local runs use the device zone of the main process (`deviceTimeZone`). Server runs (also the device-held local CLI for synced jobs) use `input.timeZone` of the `chatAnswer` job, which the renderer now sends (`systemTimeZone()`); unknown zones are rejected with 400; other job kinds and old jobs fall back to `UTC`, stated in the result.
- Authorization: unchanged model. Server `/mcp` resolves the backend from the per-job token for `job.userId` only; both tools are read tools so `scopeMailToolsToJob` passes them for every job kind and still refuses writes for non-chat jobs. `@relay/ai` `MAIL_READ_TOOLS` includes both, the chat prompt mentions them.

## 5. RDATE PERIOD

- Flattening at parse time records each period's exact length as `X-RELAY-RDATE-DURATION:<recurrence key>|<ms>` in the stored ICS. The expander uses it for that occurrence's end, and the stored series range covers the longest period. The REPLY builder does not copy X- properties.

## 6. RECURRENCE-ID;RANGE=THISANDFUTURE

Branch `fix/bcc-and-series-cancel`.

Design: a series cut-off honoured by the expander, not a rewrite of the organizer's ICS. The stored ICS of the master stays exactly what the organizer sent (valid for REPLY building and later updates), and the range lives on the override row.

- Parser and stores: `ParsedCalendarEvent.thisAndFuture` (only set when `RECURRENCE-ID;RANGE=THISANDFUTURE`), `endsSeries` (marks a cut row, a THISANDFUTURE cancellation: set by the parser for a cancelled THISANDFUTURE VEVENT and by the engine on every cut it stores) and `rangeRevision` (SEQUENCE + DTSTAMP of the range request itself). A row with `thisAndFuture` but without `endsSeries` is a range request even when its own anchor occurrence is cancelled. One migration per store adds all of them (`this_and_future`, `ends_series`, `range_sequence`, `range_dtstamp`): SQLite `0015_calendar_this_and_future`, Postgres `0017_calendar_this_and_future`. Mappers only put the fields on the event when they are set, so existing rows and fixtures compare unchanged.
- Two revisions per range row: `sequence`/`dtstamp` of the row follow its anchor instance (so a late older REQUEST cannot resurrect a cancelled anchor), while range precedence (which range wins, whether a range lifts a cut, whether a cut or an exact override beats a range) uses `rangeRevision` (fallback: the row revision). Cut rows work the same way: their precedence revision (`rangeRevision`, fallback the row revision) is what `lifted`, `cutOffByRange` and the expander compare, so cancelling a cut's anchor again on its own does not undo a lift. An instance CANCEL of a range anchor or a cut anchor freezes that revision before it bumps the row, so cancelling the Nov 3 anchor at SEQUENCE 3 does not let the Nov 3 range (SEQUENCE 1) override a Nov 5 range (SEQUENCE 2).
- Expander (`expand/series-plan.ts`, `series-choice.ts`, `range-span.ts`):
  - Cut: a cancelled THISANDFUTURE override whose SEQUENCE/DTSTAMP is not older than the master ends the series. No occurrence at or after its recurrence id is produced (RRULE with COUNT or UNTIL, RDATE incl. flattened PERIOD lengths, EXDATE all go through the same iterator), and overrides at or after it that are older than any cut applying at their recurrence id are hidden (several cuts can apply at once; the newest decides). Overrides newer than the cut (the organizer sent the instance again) stay. A cut older than the master is ignored, like an old instance CANCEL. A cut at or before DTSTART leaves nothing. A range request anchored at or after a cut with a strictly newer SEQUENCE/DTSTAMP lifts it: occurrences come back from its anchor on with its changes, the ones between the cut and that anchor stay cancelled, and a later newer cut ends the series again. A range request anchored before a cut never extends past it, whatever its revision. The expander decides every occurrence by these segments (`series-choice.ts`) and only stops iterating at the first cut that nothing lifts.
  - Range REQUEST: when only its anchor occurrence is cancelled (plain instance CANCEL), the anchor stays cancelled and the later occurrences keep the change; they are shown with the status of the range request's own ICS. From the override's recurrence id on, every master occurrence gets the override's time shift (measured and applied in wall time of the master zone, so it is right on both sides of a DST change and for changes made across one), the override's duration and all its properties (the occurrence's `event` is the override row, `recurrenceId` the original instance key). Among several range overrides the newest (SEQUENCE, DTSTAMP, then the later one) wins. An exact override, cancelled or not, wins only when it is not older than the range override; older exact overrides (also older instance cancellations) are replaced, newer ones stay. A nominal DURATION of the range request (for example `P1D`) is applied in wall time per occurrence, an exact DTEND length as elapsed time. Expansion widens its iteration by the largest shift so occurrences shifted into a window from far outside it are found.
  - Recurrence ids are compared as instants: UTC keys directly, date and floating keys in the viewer zone (`recurrence-instant.ts`).
- `CalendarExpander.seriesRangeEnd(master, overrides)` (new port method): the stored range end of a master with its cut and shifts, `min(natural series end, cut + longest occurrence + 1 day)` where the longest occurrence includes RDATE periods and range shifts. Fake expanders return `master.rangeEndsAt`.
- Engine:
  - `InviteRangeCancelHandler` (CANCEL with the flag): ignored when older than the master or than the row at the cut. Otherwise cancels the row at the cut (marked `thisAndFuture` + `endsSeries`, linked to the CANCEL message), but never rewrites later overrides: the expander hides them while the cut applies, and a newer range request that lifts the cut restores them under its own changes. Their thread cards still show "cancelled", and RSVP to them is refused: `effective-event.ts` derives the status from the cuts applying to the row and is used by `InvitationQuery`, `RsvpService` and `GoogleFirstRsvpService` before any reply is built, mailed or sent to Google (the usual "This invitation cannot be answered" refusal, HTTP 400), and the master when the cut is at or before its start (whole series). Without a row at the cut (CANCEL first, also untimed CANCELs) a tombstone is stored; a bare CANCEL takes the series title. Replays with the same SEQUENCE/DTSTAMP write nothing.
  - `InviteRequestHandler`: an override REQUEST is ignored when any cut that applies at its recurrence id (not lifted by a newer range request) is newer than it (out-of-order delivery). A plain instance CANCEL keeps the range flags of its row, so it neither removes a cut nor a range change.
  - `SeriesRangeKeeper` recomputes the master's `rangeEndsAt` through `seriesRangeEnd` after every invite write that touches a series with THISANDFUTURE rows (cut added, master replaced after the cut, range override added) and saves it with `saveIfCurrent`, inside the same retried unit of work (also on replays, so a retried write cannot skip it). THISANDFUTURE REQUEST rows get the same range end (`series-range-rows.ts`): their start is at or before every shifted occurrence, so window queries also find occurrences moved before the series start. `listForRange` therefore stops returning a cut series after the cut. Feed refreshes do the same per feed (`feed-series-ranges.ts`).
- Google Calendar API path: unchanged. Google events carry no RANGE (RECURRENCE-ID comes from `originalStartTime`), Google sends a new REQUEST with a shortened RRULE for "this and following", which is a normal master update. The SQLite Google upsert copies the new column.

- Arrival order: `InviteQueue` gives queued `calendar-invite` work strictly increasing `createdAt` values, so messages synced in the same millisecond are applied in arrival order. Before, ties fell back to the message id, whose random suffix shuffled them; a plain instance CANCEL could then be applied before its REQUEST and get lost.
- E2E tests wait until every message is synced (one thread per message) and the `calendar-invite` queue is empty before asserting (`apps/server/test/calendar/support/invite-settle.ts`); the desktop test checks that every SMTP delivery is in INBOX first and that the queue is empty after `local.sync.now`.

Remaining gaps:

- A newer instance REQUEST exactly at the cut replaces the tombstone row (same series + recurrence key), so the cut disappears and later instances return. Needs a separate row kind for cuts.
- A plain instance REQUEST exactly at the anchor of a range request replaces that row and drops the range change for later instances (one row holds both); only an instance CANCEL is handled.
- Derived occurrences of a range whose anchor is cancelled belong to that cancelled row, so an RSVP for them is refused (`canRespond` sees the cancelled row).
- Overrides cancelled by a cut stay cancelled when a newer master later extends the series again.
- Range REQUEST overrides whose all-day kind differs from the master apply only their properties, not the shift.
- Invitations ingested before the migration are not re-evaluated (a THISANDFUTURE CANCEL ingested earlier stays single-instance until it is ingested again).
- Pre-existing: overrides beyond a shortened RRULE (Google "this and following") stay visible as standalone instances.

## Tests

Verified in a clean export of HEAD minus the uncommitted google-calendar layers (the live checkout had google WIP that broke `occurrences` at the time):

- `@relay/engine` 253, `@relay/mcp-mail` 36, `@relay/ai` 57, `@relay/shared` 50, `@relay/calendar` 71, `@relay/store-sqlite` 121, `apps/server` 246, `apps/desktop` 325 (incl. `test/main/local-calendar-tools.e2e.test.ts` with GreenMail and `test/ai/mail-mcp-calendar.e2e.test.ts` with Postgres).
- New: `engine/test/services/calendar-invite-queue|calendar-invite-backfill|calendar-reply-order|calendar-rsvp-sent.test.ts`, `store-sqlite/test/invite-backfill.test.ts`, `server/test/persistence/invite-backfill.test.ts`, `mcp-mail/test/calendar-tools.test.ts`, `calendar/test/rdate-periods.test.ts`.
- THISANDFUTURE: `calendar/test/series-cancel-range.test.ts` and `series-range-override.test.ts` (real ICS through parser, expander and REPLY builder), `engine/test/services/calendar-range-cancel.test.ts` and `calendar-range-precedence.test.ts` (ordering, idempotency, precedence, RSVP refusal), `store-sqlite/test/calendar-this-and-future.test.ts`, `server/test/persistence/calendar-this-and-future.test.ts`, `server/test/calendar/series-range.e2e.test.ts` (GreenMail + Postgres, in-order and CANCEL-first delivery, stored range end), `desktop/test/main/local-calendar-series-range.e2e.test.ts` (GreenMail + SQLite, Outlook VTIMEZONE, all-day, replayed CANCEL).

## Known gaps

- Failed (`failedAt`) invitation rows are kept for diagnostics and only disappear with the account; there is no UI or manual retry for them.
- Back-fill re-fetches whole candidate messages (IMAP part fetch by section is not in the `MailProvider` port).
- Non-chat AI jobs (summary, reply suggestions, create task) get calendar times in UTC because only `chatAnswer` carries the device zone.

## gpt-6.1-sol review (4 findings, all fixed)

1. Retry scheduling overwrote a newer re-queue and could mark it failed: new revision-checked `PendingWorkRepository.replace(work, payload)` (memory, SQLite, Postgres); a stale reschedule is a no-op.
2. Replayed (back-fill) or reordered REPLYs could overwrite a newer response: `CalendarAttendee.repliedAt` (optional, stored in the attendees JSON) records the DTSTAMP of the applied REPLY, older REPLYs of the same SEQUENCE are ignored; a local RSVP records `repliedAt = now`.
3. Replaying an identical REQUEST (same SEQUENCE, DTSTAMP and status) reset attendee responses: it is now a no-op that still releases parked replies.
4. Zoned RDATE PERIOD lengths across DST were measured in wall time: endpoints are resolved to instants with the RDATE TZID, duration-form periods use their duration.

No issue found by the reviewer in: atomic message/work insertion, poison isolation, back-fill transaction boundaries and SQL predicates, migration seeding, MCP user scoping and job-kind write refusal, socket validation, zone propagation and formatting.

Re-verified in a clean export of HEAD + fixes: engine 256, calendar 72, mcp-mail 36, ai 57, shared 50, store-sqlite 127, server 256, desktop 325 tests green.

## Notes for other agents

- Anyone constructing `Repositories` must add `inviteCandidates` (memory, SQLite and Postgres implementations exist).
- Anyone implementing `PendingWorkRepository` must add `replace`.
- google-calendar: `google-first-rsvp.ts` does not set `repliedAt` on the attendee yet; set it to the RSVP time so a replayed older REPLY cannot undo a Google-side RSVP.
- `createCalendarComponents(deps, events, sentCopies, ...)` returns `CalendarService` directly; invite ingestion lives in `createInviteComponents(deps, events)`.
