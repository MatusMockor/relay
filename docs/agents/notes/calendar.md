# calendar agent

## Status

Feature complete for items 1-4. Item 5 (AI/MCP calendar tool) not done, see gaps. gpt-6.1-sol review done, see below.

## Library choice

`ical.js` 2.2.1 (Mozilla, used by Thunderbird and Nextcloud), pinned exactly in `packages/calendar` (only new third-party dependency).

- Full RFC 5545 parser and serializer (serialization is needed for the iMIP REPLY).
- Recurrence engine (RRULE, RDATE, EXDATE) and per-file VTIMEZONE resolution (2.x resolves TZID from the component tree, so Outlook's Windows zone names work through the embedded VTIMEZONE).
- Zero runtime dependencies, ships TypeScript types.
- `node-ical` 0.27 was rejected: parse-only (no serializer), wraps `rrule-temporal` + `temporal-polyfill`, and bundles its own URL fetching which we must not use (SSRF policy lives in our fetcher).
- Gap of ical.js: no IANA database. TZIDs without a VTIMEZONE fall back to `Intl` when they are IANA names, floating times and all-day dates use the viewer zone (`packages/calendar/src/ics/wall-clock.ts`, DST gap/overlap per RFC 5545).

## What exists

- `@relay/shared`: `CalendarOccurrence`, `CalendarInvitation`, `CalendarSubscription`, `TimeZoneSchema`, `CalendarFeedUrlSchema` (https only), `api.calendar.*` (`GET /calendar/occurrences`, `GET /calendar/invitations`, `POST /calendar/events/:id/rsvp`, CRUD + refresh on `/calendar/subscriptions`), IPC `local.calendar.*` (`calendarInvokeChannels`), realtime `calendar.updated`.
- `@relay/engine`: ports `CalendarEventRepository`, `CalendarSubscriptionRepository`, `CalendarAdapters` (parser, expander, reply builder, feed fetcher, feed secrets). `EngineServices.calendar: CalendarService` (facade over `OccurrenceQuery`, `InvitationQuery`, `RsvpService`, `SubscriptionService`, `DueSubscriptions`). `InviteIngestor` is called by `MessageIngestor` for every newly created message with calendar parts (REQUEST/PUBLISH upsert by UID + RECURRENCE-ID with SEQUENCE/DTSTAMP precedence, CANCEL for series or instance, REPLY updates attendee PARTSTAT, my PARTSTAT from the account address). `EngineDeps.calendar` and the two repositories are required.
- `@relay/calendar` (new package): `IcalCalendarParser`, `IcalCalendarExpander` (window expansion with overrides and EXDATE), `IcalReplyBuilder` (RFC 5546 REPLY), `HttpsCalendarFeedFetcher` (https only, IP literal + post-DNS check of every resolved address via a custom `lookup`, re-check on every redirect, 10 MB / 20 s limits, ETag + If-Modified-Since, messages never contain the URL), `isPublicAddress`.
- `@relay/mail-core`: `ParsedMessage.calendarParts` from `text/calendar`, `application/ics` and `.ics` parts; `OutgoingMessage.calendar` becomes a nodemailer `icalEvent` (multipart/alternative `text/calendar; method=REPLY`).
- Stores: SQLite `0009_calendar`, `0010_calendar_loose_links`; Postgres `0011_calendar`, `0012_calendar_loose_links` (thread/message ids are plain columns because the thread row is built after the message by the flusher).
- Server: `CalendarModule` (two controllers, `CalendarFeedScheduler` on its own pg-boss queue `due-calendar-feeds`), `CalendarAdaptersModule`, feed URLs AES-GCM encrypted in `calendar_subscriptions.url_envelope` with AAD bound to the subscription id. Env: `CALENDAR_FEEDS_ALLOW_PRIVATE_NETWORKS` (default false), `CALENDAR_FEED_REFRESH_SECONDS` (900), `CALENDAR_FEEDS_CA_FILE` (optional private CA).
- Desktop main: `createCalendarAdapters`, `SecretStoreCalendarFeedSecrets` (encrypted secret store namespace `calendar-feeds`), `createCalendarHandlers`, due job `calendar-feeds`. Env `RELAY_CALENDAR_FEEDS_ALLOW_PRIVATE_NETWORKS`.
- Renderer: `CalendarClient` (part of `MailClient`, implemented for remote, local and demo), `CalendarPane` (week strip, day agenda, now line, per-source colors, invite rows open their thread), `InvitationCards` in the thread view (time, place, organizer, conflicts, Prijať / Možno / Odmietnuť), Settings > Kalendáre (add by secret iCal URL, `webcal://` normalized, refresh, color, remove).

## Tests

- `pnpm --filter @relay/calendar test` (parser, expander incl. DST and overrides, reply builder, fetcher against a local HTTPS server, SSRF table).
- `pnpm --filter @relay/engine test` (`calendar-invites`, `calendar-rsvp`, `calendar-subscriptions` with in-memory adapters).
- `pnpm --filter @relay/store-sqlite test` (`calendar-repository`), `apps/server` `test/persistence/calendar.test.ts` and `test/calendar/calendar.e2e.test.ts` (GreenMail invite sync, iMIP REPLY delivered to the organizer, HTTPS feed with ETag, URL secrecy).
- `apps/desktop` `test/main/local-calendar.e2e.test.ts` (local mode over IPC with GreenMail), `src/renderer/test/calendar.test.tsx` (card, pane, settings).

## gpt-6.1-sol review (12 findings, no SSRF bypass or URL leak found)

Fixed:

1. CANCEL/REPLY without DTSTART were dropped: the parser now emits untimed scheduling events (`ParsedCalendarEvent.timed`).
2. A delayed instance CANCEL could hide an occurrence of a newer master: it is ignored when older than the master.
3. Cancellations kept the old DTSTAMP, so a delayed REQUEST could resurrect them: cancel uses full SEQUENCE + DTSTAMP precedence and stores its DTSTAMP.
4. UNTIL/EXDATE in UTC for an IANA TZID without VTIMEZONE were compared as floating: `zone-normalizer.ts` converts them to wall time of that zone at parse time.
5. The 20k iteration cap hid frequent series far from DTSTART: `fast-forward.ts` starts SECONDLY..WEEKLY rules without COUNT close to the window.
6. All-day and nominal DURATION ends across DST: computed per occurrence in wall time (`occurrence-end.ts`).
7. RDATE PERIOD values broke expansion: flattened to their start times; RDATE-only series now include DTSTART.
8. Instance REPLY no longer touches the master, stale REPLY (lower SEQUENCE) is ignored.
9. Postgres and SQLite upserts enforce SEQUENCE/DTSTAMP precedence atomically (`ON CONFLICT ... DO UPDATE ... WHERE`).
10. Feed refresh locks the subscription row (`lockForRefresh`, `FOR UPDATE` on Postgres) and replaces events and records validators in one transaction.

Deferred (with reasons): 8. `RECURRENCE-ID;RANGE=THISANDFUTURE` cancellations only cancel the one instance. Needs a series cut-off in the expander. Google and Outlook usually send a new REQUEST with a shortened RRULE instead. 12. Invite ingestion is best effort after the message commit. Running it inside the message transaction would let one bad invite block the message forever, because Postgres aborts the whole transaction on error. The cleaner fix is a pending-work entry in the message transaction, done by the change flusher.

## Known gaps

- Invitations that arrived before this feature are not back-filled (only newly synced messages are ingested).
- AI/MCP calendar tool not added: it needs a new method across `MailToolBackend`, the socket protocol, the server HTTP MCP and a time zone for server runs.
- RDATE PERIOD durations are not kept (each occurrence uses the master duration).
- A REPLY that arrives before its REQUEST (organizer view, first sync order) is ignored.
- RSVP does not append the sent REPLY to the Sent folder.
- CodeRabbit CLI is not installed on this machine, so no CodeRabbit run.

## Notes for other agents

- Anyone constructing `EngineDeps` or `Repositories` by hand must pass `calendar` adapters and the two calendar repositories (in-memory versions in `packages/engine/test/support`).
- compose-extras: my only edit in `compose-mime.ts` is the optional `icalEvent` mapping.
