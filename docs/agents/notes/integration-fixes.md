# integration-fixes

## Status

All six findings of the gpt-6.1-sol integration review were real and are fixed. Commits: `dff94a4` (finding 1), `a2e636b` (findings 2-6), plus the re-check follow-up (see Review).

## Findings

1. **High - draft cleanup deleted a newly referenced blob (real).** `DraftService.releaseDropped` and `removed` called `AttachmentStore.delete` outside the reference lock. Both now go through `AttachmentSweeper.release` (exclusive side of `AttachmentReferenceLock` + `AttachmentBlobCatalog.deleteUnreferenced`). `DraftServiceDeps.attachments` was replaced by `blobs: Pick<AttachmentSweeper, 'release'>`; `createComposeService` takes the shared `attachmentSweeper` (one additive line in `create-engine-services.ts`). Account removal already used `sweeper.release`, no change. Test: `packages/engine/test/services/draft-attachment-release.test.ts` (another draft attaches the dropped / deleted id right after the draft write commits).
   - Ownership: `deleteUnreferenced` is not user scoped, but the ids come from stored draft rows, and the Postgres draft repository only links attachments owned by the user (`replaceDraftAttachments`), so no cross-user delete.
   - Remaining window (same as the sweeper's documented one): a request that passed its reference checks but writes after the blob was removed. On Postgres the attach silently drops the missing id (owned-id filter); on desktop the draft points at a missing file and sending fails with `not_found`.
2. **Medium - RSVP completion overwrote newer invitation updates (real).** New `InviteResponses` (`services/calendar/invite-responses.ts`): after sending, `record()` reloads the event, skips when UID / RECURRENCE-ID / SEQUENCE changed or a newer reply of the same attendee is stored, merges only the responding attendee and writes with a conditional `updateResponse` (`CalendarResponseChange.expectedUpdatedAt`, implemented in Postgres, SQLite and memory). Retries up to 5 times on a lost race, then fails with `conflict` instead of reporting success without the local answer. Tests: `calendar-rsvp-races.test.ts` (another attendee's REPLY and a rescheduled REQUEST arriving during SMTP), repository tests in `apps/server/test/persistence/calendar.test.ts` and `packages/store-sqlite/test/calendar-repository.test.ts`.
3. **Medium - in-flight Google write repopulated a disabled calendar (real).** `GoogleEventStore.store` and the override branch of `forget` take `googleCalendars.lockForSync` inside the unit of work (same row lock the sync uses, and the preference update writes the same row) and skip when the calendar is gone or disabled. `GoogleEventService.create` refuses a disabled calendar up front and reports a conflict (`GOOGLE_MESSAGES.createdInDisabled`) when the calendar was disabled while Google created the event. `OccurrenceQuery` filters events of disabled calendars (`GoogleCalendarVisibility`) before preferring Google copies. Test: `google-calendar-disable-races.test.ts`.
4. **Medium - calendar pane RSVP left the mail invitation unanswered (real).** `GoogleEventService.respond` calls `InviteResponses.reconcile`, which records the answer on invite copies with the same UID, attendee identity (`identityKey`) and RECURRENCE-ID whose SEQUENCE is not newer than the Google copy, and emits invite-scoped `calendar.updated`. The reply timestamp is taken before the Google call, so a slower older answer that reconciles last loses to a newer one. Test: `google-rsvp-reconcile.test.ts`.
5. **Medium - Google-backed RSVP dropped reply precedence (real).** `GoogleFirstRsvpService` records through `InviteResponses.record` with `repliedAt` taken before the Google call, so an older iMIP REPLY waiting in `pending_work` loses. Test: `google-rsvp-reconcile.test.ts` (both entry points).
6. **Medium - disconnect did not notify other clients (real).** `GoogleConnectionService.disconnect` emits `calendar.updated` (`sourceKind: 'google'`, `sourceId: <connection id>`) after deletion. Renderers invalidate `['mail', 'calendar']` regardless of the id. Test: `google-calendar-disable-races.test.ts`.

## Known gaps

- Reverse direction of finding 2 (not new): ingestion (`applyReply`, REQUEST upsert) still writes the whole row from the snapshot read inside its transaction, so an RSVP committed between that read and the write can be overwritten. Suggested follow-up: make `applyReply` use the conditional `updateResponse` and fail the unit of work on a lost race (the pending work retry re-reads).
- `expectedUpdatedAt` compares millisecond timestamps; two writes of the same row within the same millisecond are not distinguished. RSVP writes always advance the timestamp by at least 1 ms.

## Review (gpt-6.1-sol re-check)

- Confirmed fixed: 1, 3, 5, 6; 2 and 4 partly fixed, with two follow-ups (both valid, both fixed with tests):
  - medium: once `record()` ran out of retries it returned the old snapshot as if it had succeeded. It now throws `ConflictError` (`calendar-rsvp-races.test.ts`).
  - medium: a calendar pane answer took its timestamp at reconcile time, so an older answer that was slower could overwrite a newer one. The timestamp is now taken when the request starts (`google-rsvp-reconcile.test.ts`).
- Test gaps it noted and accepted as is: the repository tests for the conditional write do not use concurrent transactions (the condition is a single UPDATE ... WHERE, Postgres re-checks it on the latest row version).

## Tests run

- `pnpm --filter @relay/engine lint typecheck test`: green (276).
- `@relay/store-sqlite` lint, typecheck, test: green (127).
- `@relay/server` lint, typecheck, test: green (256, real Postgres).
- `@relay/desktop` test: green (340) - the native module loaded for Node at the time.

## Follow-up: ingestion vs RSVP (agent `ingestion-cas`)

Closes both known gaps above. Commits: `0f2dcf7` (revision column), `b5bdc94` (ingestion), `b6c982e` (re-check follow-up).

- **Revision counter.** `calendar_events.revision` (integer, default 1; migrations `store-sqlite 0013_calendar_event_revision`, `server 0015_calendar_event_revision`). `StoredCalendarEvent.revision` is assigned by the stores: every write advances it (`upsert`, `updateResponse`, `saveIfCurrent`, Google `save` in memory, SQLite and Postgres; feed rows start at 1). Objects built in code carry `revision: 0` (new) or the revision they were read with.
- **Conditional writes.** `CalendarResponseChange.expectedUpdatedAt` is replaced by `expectedRevision`, so two writes in the same millisecond are no longer confused. New `CalendarEventRepository.saveIfCurrent(event)`: writes the whole row only when the stored revision still equals `event.revision`; `revision: 0` inserts only when the instance (series key + recurrence id) does not exist; returns `null` on a lost race.
- **Ingestion.** REQUEST/PUBLISH, CANCEL, REPLY and parked REPLY release save through `saveCurrent` (`services/calendar/invite-write.ts`), which throws `StaleInviteError` (a `ConflictError`) on `null`. `InviteIngestor` re-runs the handler for that event (fresh read, same precedence rules) up to 5 times inside the unit of work; partial writes of a failed attempt are re-applied idempotently and the result counts as changed. If it still loses, the unit of work rolls back and `InviteWorkProcessor` reschedules the item with `afterConflict` (`invite-retry.ts`): backoff delay for the current attempt count, `attempts` not incremented, never `failedAt`. Other items in the same flush continue.
- **RSVP side unchanged in shape:** `InviteResponses` compares `revision`; the old "+1 ms" timestamp trick is gone.
- **For other agents:** anyone building a `StoredCalendarEvent` literal must set `revision` (0 for new). Anyone writing `calendar_events` rows must advance `revision`. `upsert` is now only used by tests and seeding; production invite writes go through `saveIfCurrent`.
- Tests: `engine/test/services/calendar-ingestion-races.test.ts` (REPLY, same-SEQUENCE REQUEST and CANCEL applied from a read taken before a local RSVP; stored answers kept across same-SEQUENCE REQUESTs), `calendar-ingestion-conflicts.test.ts` (persistent conflict: retried with backoff, never poison, other invite stored, applied once the conflict stops), `google-rsvp-reconcile.test.ts` (Google-backed RSVP during REPLY ingestion), `store-sqlite/test/calendar-event-revisions.test.ts`, `server/test/persistence/calendar-event-revisions.test.ts` (incl. an RSVP committed during an open ingestion transaction and an RSVP read before an ingestion write that commits first). The engine race tests fail on the previous ingestion code.

### gpt-6.1-sol re-check (2 findings, both valid, both fixed in `b6c982e`)

1. P1: a same-SEQUENCE REQUEST copied the attendee list from the organizer, so the stored answer and `repliedAt` of an attendee (including my RSVP) were lost and a later older REPLY could win again. Pre-existing, but it defeated the ingestion fix. `attendee-answers.ts` (`withStoredAnswers`): on the same SEQUENCE each attendee keeps the stored partstat + `repliedAt` unless the organizer view is newer and not `needs-action` (then the organizer value wins with `repliedAt = DTSTAMP`). A new SEQUENCE still resets answers.
2. P2: `GoogleEventRepository.replaceCalendar` deleted and re-inserted rows with kept ids at revision 1. All three stores now carry the previous revision of the same series key + recurrence id and advance it (`google-event-revisions.ts` in SQLite and Postgres).

Reviewer found no issue in: retry semantics (bounded, transactional, conflicts never count towards poison, real errors keep the failure path), reverse-direction RSVP merging, CANCEL, REPLY, parked release, insert-if-absent, migrations.

### Tests run (after the follow-up)

- `@relay/engine` lint, typecheck, test: green (284).
- `@relay/store-sqlite` lint, typecheck, test: green (130).
- `@relay/server` lint, typecheck, test: green (262, real Postgres).
- `@relay/desktop` test: green (341, the native module was built for Node). The desktop typecheck fails only in another agent's untracked `src/renderer/test/known-contacts.test.ts`.
