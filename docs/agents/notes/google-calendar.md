# google-calendar agent

## Status

Done and committed: shared contract, engine, mail-core OAuth, `@relay/calendar` Google gateway, SQLite + Postgres stores (migrations SQLite `0012_google_calendar`, Postgres `0014_google_calendar`), server, desktop main, renderer UI. gpt-6.1-sol review done, all 6 findings fixed (see below). Nothing tested against real Google yet (no client ID); everything runs against local stubs.

## Design

- New calendar source kind `google`: `CalendarSource = { kind: 'google', calendarId: GoogleCalendarId }`. Google events live in `calendar_events` (new nullable columns `google_calendar_id` with cascade, `remote_id`, `remote_etag`), so `OccurrenceQuery`, `findSeries` and the expander work unchanged. Postgres check `calendar_events_one_source` is now `num_nonnulls(account_id, subscription_id, google_calendar_id) = 1`.
- A Google account is a `GoogleCalendarConnection` (own id, email, optional link to a Gmail `accountId`, plain column without FK) with its own OAuth credentials: server AES-GCM envelope `google_calendar_connections.credentials_envelope` (AAD `relay:google-calendar:<id>`), desktop encrypted secret store namespace `google-calendar`. Calendar never writes the mail account vault, so disconnecting the calendar never breaks mail.
- Token refresh reuses mail-core: `RefreshingOAuthTokenProvider` is now a thin wrapper over the generic `RefreshingOAuthTokens<Key>` (same single-flight + compare-and-set logic), `GoogleCalendarAccessTokens` uses it keyed by connection id and maps `invalid_grant` (`GoogleTokenRejectedError`) to `ReauthorizationRequiredError` -> connection status `reauthorize`.
- Google events are converted to an iCalendar VEVENT (DTSTART/DTEND with TZID in wall time, Google `recurrence` lines, RECURRENCE-ID from `originalStartTime`, attendees with PARTSTAT) and parsed with `IcalCalendarParser`, so recurrence, all-day, DST and time zones reuse the tested parser and expander. Every API response is validated with zod (`packages/calendar/src/google/google-api-schemas.ts`).
- Sync: `events.list` with `singleEvents=false`, `showDeleted=true`, `maxResults=250`, paging, `syncToken`; full sync with `timeMin = now - 365 days`; 410 Gone -> full resync. Full sync replaces the calendar's events in one transaction; incremental applies upserts / series removals. The result is stored only if the calendar row (locked `FOR UPDATE` on Postgres) still has the sync token the run started from (no regression from a concurrent run). Cancelled instances without iCalUID get the master's uid via `recurringEventId`.
- Polling: server pg-boss queue `due-google-calendars` (env `GOOGLE_CALENDAR_SYNC_SECONDS`, default 300), desktop due job `google-calendar` (env `RELAY_GOOGLE_CALENDAR_SYNC_SECONDS`). Connections in `reauthorize` are skipped until reconnected. On-demand: `POST /calendar/google/connections/:id/sync`.
- Dedupe: `preferGoogleCopies` hides an `invite` row when a Google row has the same iCalUID and the same attendee identity (`myEmail`), and moves the invite's `threadId` to the Google occurrence. RSVP on such an invite (`GoogleFirstRsvpService`, subclass of `RsvpService`) goes through Google instead of iMIP when the Google copy is answerable; otherwise iMIP as before.
- Two-way writes: RSVP = GET event, compare ETag, PATCH `attendees` (only my `responseStatus` changed, other attendee fields kept) with `If-Match`, `sendUpdates=all`; on conflict the fresh copy is stored and the RSVP retried (max 3 attempts). Delete = DELETE with `If-Match`; 412 -> local copy refreshed and `ConflictError` (409) with a Slovak message, 404/410 -> treated as deleted. Create = POST (`sendUpdates=none` without attendees). Only own events (organizer is me / this calendar) in `owner`/`writer` calendars can be deleted. Deleting any occurrence of a recurring series deletes the series (UI says "Zmazať celú sériu?"); an instance that vanished on Google is kept as a cancelled override instead of dropping the series.

## Scopes (minimal)

- `https://www.googleapis.com/auth/calendar.events`: read and write events on calendars the user can access (events.list/get/insert/patch/delete). The narrower `calendar.events.owned` cannot RSVP to events in calendars the user does not own and `calendar.events.readonly` cannot write.
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`: list the user's calendars with their colour, access role and visibility (calendarList.list). Avoids the broad `calendar` scope.
- `openid email` for the account address (standalone connection). Combined consent adds `https://mail.google.com/` for Gmail.
- Incremental authorization: the calendar consent sets `include_granted_scopes=true` and `login_hint`, so an existing Gmail account grants calendar later without losing mail.

## Configuration (Google client ID)

- Desktop (local mode and the consent window in synced mode): `RELAY_GOOGLE_CLIENT_ID` (+ optional `RELAY_GOOGLE_CLIENT_SECRET`) or `<userData>/google-oauth.json` `{ "clientId": "...", "clientSecret": "..." }`. Missing -> Settings > Kalendáre shows the Slovak hint from `OAuthNotConfiguredError`.
- Server (synced mode): `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (same OAuth client as the desktop). Missing -> `GET /calendar/google` returns `configured: false` with a Slovak `setupHint`.
- The Google Cloud project needs the Google Calendar API enabled and the two calendar scopes on the consent screen.
- Test-only endpoints: `GOOGLE_CALENDAR_API_URL` (server), `RELAY_GOOGLE_CALENDAR_API_URL` (desktop), token endpoint via `GOOGLE_OAUTH_TOKEN_ENDPOINT` / `tokenEndpoint` in `google-oauth.json`.

## Ready for others

- `EngineServices.googleCalendar: GoogleCalendarService` (`overview`, `connect`, `disconnect`, `sync`, `updateCalendar`, `createEvent`, `deleteEvent`, `respond`, `syncDue`). `EngineDeps.googleCalendar?: GoogleCalendarAdapters` (optional; without it the feature reports "not configured").
- `Repositories.googleConnections`, `googleCalendars`, `googleEvents` (memory, SQLite, Postgres). Anyone constructing `Repositories` by hand must add them.
- `CalendarOccurrence` has new fields `googleCalendarId`, `canDelete`, `canRespond`.
- API `api.googleCalendar.*`, IPC `local.calendar.google.*` and `oauth.google.authorizeCalendar`; `oauth.google.authorize` accepts `calendar: true` for the combined Gmail + calendar consent.
- Shared test stub `startGoogleCalendarStub` in `@relay/config/test-infra` (OAuth token endpoint + Calendar API subset with sync tokens, ETags, 410/412).

## Notes for calendar-followups

- My edits in your files are additive: `create-calendar-service.ts` (colors + access + `createRsvpService`), `occurrence-query.ts` (`preferGoogleCopies`, optional `access`), `occurrence-mapper.ts` (new fields), `calendar-colors.ts` (optional Google calendars), `calendar-source.ts` (google key).

## UI

- Settings > Kalendáre: "Google kalendár" panel above the iCal subscriptions. "Pripojiť Google kalendár" (calendar-only consent), "Povoliť kalendár pre <gmail>" for Gmail accounts without calendar (incremental consent with login hint), per connection status / Synchronizovať / Odpojiť / Pripojiť znova (when `reauthorize`), per calendar a switch (show/hide) and a colour swatch. Missing client ID -> the Slovak setup hint, connect disabled. Hidden in demo mode.
- Calendar pane: "+" button "Nová udalosť" opens a keyboard friendly form (title autofocus, Celý deň switch, Od/Do as `9:30`, Miesto, Účastníci comma separated, Kalendár select when more than one writable calendar; Enter submits, Esc closes). Google rows show Prijať / Možno / Odmietnuť when `canRespond` and Zmazať (two-step confirm) when `canDelete`. Colours come from the Google calendar colour.
- Gmail sign-in now requests the calendar scopes in the same consent (`calendar: true`); when the user leaves calendar checked, the calendar connection is created together with the account (server `AccountCreationService`, desktop `EngineGoogleAccountConnector`).

## Tests

- `pnpm --filter @relay/engine test` (`google-calendar-sync`, `google-calendar-writes`, `google-calendar-review` with an in-memory Google fake): 47 files / 260 tests green.
- `pnpm --filter @relay/calendar test` (gateway against a local HTTP stub: calendar list paging, sync params, 410, DST series with moved and cancelled instances, If-Match RSVP, 412/410 delete, 401/403 reauthorization, zod rejection): 8 files / 68 tests.
- `pnpm --filter @relay/mail-core test` (calendar scopes, incremental consent URL, token refresh single-flight, invalid_grant): 24 files / 239 tests.
- `pnpm --filter @relay/store-sqlite test`: 24 files / 126 tests. `apps/server`: `test/google-calendar/google-calendar.e2e.test.ts` (Nest + Postgres + Google stub: connect, scope refusal, RSVP, create, delete with 409 conflict, incremental sync, reauthorize, combined Gmail consent) and `test/persistence/google-calendar.test.ts`; full server suite 69 files / 255 tests green.
- `apps/desktop`: `test/main/local-google-calendar.e2e.test.ts` (local runtime over IPC + SQLite + Google stub, missing client ID), `src/renderer/test/google-calendar.test.tsx`, `src/renderer/test/event-draft.test.ts`; full desktop suite 83 files / 335 tests green.

## gpt-6.1-sol review (6 findings, all fixed in a2989c7)

1. RSVP of an email invite could go through a Google copy of another attendee identity: Google routing now requires the same iCalUID and `myEmail`.
2. Deleting an overridden instance removed the whole local series while Google deleted only the instance: delete now targets the series master; a vanished instance becomes a cancelled override.
3. Full sync silently truncated at 20 000 events but advanced the sync token: it now fails before replacing events.
4. Incremental sync processed a cancelled exception before its new master in the same batch and lost it: masters are applied first.
5. Calendar list reconciliation saved whole records and could undo a concurrent disable or regress a sync token: existing rows only get `updateDetails` (name, primary, role, zone).
6. UID-only dedupe could hide an actionable invite behind someone else's shared copy: dedupe matches attendee identity.

No findings for scopes, incremental consent, the token refresher extraction, AAD-bound encryption, secret exposure over API/IPC, attendee field preservation or recurrence key conversion. CodeRabbit CLI is not installed on this machine.

## Known gaps

- Push notifications are not used (server behind VPN); polling every 5 minutes plus manual sync.
- No editing of existing events (create, delete and RSVP only); the quick form creates single-day events. RSVP or delete on an unmodified occurrence of a series applies to the whole series.
- Disconnect deletes the stored tokens but does not revoke the grant at Google.
- The first sync runs inside the connect request (a few seconds for big calendars).
- Colour changes are local to Relay (not written back to Google).
- `accountId` of a connection is set at connect time only (not updated when a Gmail account is added or removed later).
- Not verified against real Google or in Electron; needs the user's OAuth Desktop client ID and the Calendar API enabled in the Google Cloud project.
