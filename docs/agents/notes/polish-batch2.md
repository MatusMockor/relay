# polish-batch2

## Status

Fixes for the remaining issues of `e2e-batch2.md`. All five are done, each with tests, plus fixes for the review findings. `pnpm lint`, `pnpm typecheck` and `pnpm format:check` are green, and the full test suites of server, desktop, engine, mail-core, store-sqlite, calendar, mcp-mail and shared pass.

## 1. Slovak tone (`dfb8671`)

- The whole app now uses the informal "ty" register. Changed: Google calendar panel, event form, event draft validation, Google sign-in and calendar connect errors, `google-messages.ts`, Google API errors, the OAuth callback page and OAuth config error, the secure storage error, the AI location gate, and the new-mail notification ("Máš 1 novú správu").
- Found with a scan of `apps/*/src` and `packages/*/src` for 2nd person plural forms (`-te` imperatives, `máte`, `môžete`, `vás`/`vám`/`váš`, ...). Left out on purpose: the demo seed mails (they are other people's mail), the demo rewrite table (it converts to the formal form on request), and the Jira subject regexes.
- Feed validation (item 5) also turned two English validation messages into Slovak ones.

## 2. Account label vs sender name (`ff6c316`, `2179483`)

- `MailAccount.senderName: string | null` sits next to `displayName`. `displayName` is only the UI label. `senderName` is the From name and the name used in iMIP REPLY, attendee and RSVP records. `null` means the From header carries only the address.
- Migrations: SQLite `0014_account_sender_name`, Postgres `0016_account_sender_name`. Each adds `sender_name` and copies `display_name` into it, so current accounts send exactly as before. Upgrade tests seed a pre-migration row with raw SQL in both stores. Older migration tests that seeded accounts through the repository now use `seedLegacyAccount`, because the repository writes the new column.
- Defaults: an omitted `senderName` falls back to the primary account's sender name, or the first named account. This matters for Gmail, where the OAuth flow has no profile scope and so no name. An explicit `null` is kept.
- API: `senderName` is optional and nullable in the create and update bodies (trimmed, 1-200 chars).
- UI: the add form has "Meno odosielateľa" (filled from the primary account, else the synced user's name) next to "Názov účtu (nepovinné)", with a hint line. The field follows the suggestion until the user edits it. Settings -> Účty has inline inputs for both names: they save on blur or Enter, Escape reverts, and a save that comes back late does not overwrite newer typing.

## 3. Forward (`ae47a5d`)

- Each message in the thread view has a "Preposlať túto správu" button. It forwards that exact message: its body and its own files. This is Gmail's per-message forward.
- The thread-level forward (F, palette, next actions) forwards the latest message. If the latest message has no non-inline attachments but an earlier one does, it forwards the latest message that has them, body and files together.
- Why: Gmail and Superhuman forward the last message of the conversation and only that message's files. In the reported case the last message is the user's own short reply, and the user almost always wants the original with its files (an invoice to accounting, for example). Taking the body and files from the same message keeps the forward coherent. Anyone who wants the newer reply uses the per-message button.

## 4. Bcc in the Sent copy (`671778f`)

- `composeMime` builds the same MIME node twice: once without Bcc for SMTP (envelope recipients unchanged), then with `keepBcc` for the Sent folder. Message-ID, Date and boundaries are identical. `SentMessage.raw` is renamed to `sentCopy` because it only ever feeds the Sent append and ingest.
- Tests with GreenMail: the mail-core test checks that the To and Bcc recipients' copies have no `Bcc:` header and that the appended Sent copy has it and parses to `bcc`. The desktop local-mode e2e checks the same through IPC and that the stored Sent message carries `bcc`.
- Gmail is unchanged: Gmail stores its own Sent copy.

## 5. Feed validation (`641bfc1`, `f06da9c`)

- `FeedLoader` (fetch and parse) is extracted from `SubscriptionRefresher`. `SubscriptionService.create` loads the feed once before anything is saved, using the same `HttpsCalendarFeedFetcher` (so the same SSRF guard, size, redirect and timeout limits). On failure it throws a `ValidationError`: "Kalendár sa nepodarilo pridať. <reason>" (404, not iCalendar, too large, private network, ...). On success the record and secret are saved, and the events from that fetch are stored through `refresher.store` (serialized per subscription), so a new feed is fetched exactly once.
- Feeds that fail later keep their status "Chyba", and their previous events are kept.
- New subscriptions are created with `lastAttemptAt = now`, so the periodic refresh cannot pick one up while it is still being added. This was a review finding.
- Local mode now reads `RELAY_CALENDAR_FEEDS_CA_FILE`, which mirrors the server's `CALENDAR_FEEDS_CA_FILE`. Manual E2E no longer needs `NODE_EXTRA_CA_CERTS`, and the new local e2e test can serve a real HTTPS feed. The test certificate is copied to `apps/desktop/test/main/fixtures`.
- The renderer form keeps the URL and shows the error inline. The old "pridaný, ale nenačítal sa" toast is gone because that case can no longer happen.

## Review (gpt-6.1-sol)

- Fixed (medium): the add form captured the suggested sender name only on mount.
- Fixed (medium): the Settings name input overwrote newer typing when an earlier save came back.
- Fixed (medium): a subscription being added was immediately due for the periodic refresh, which could then be overwritten by the older first-fetch outcome.
- Rejected (medium): "a primary account with `senderName: null` should make new accounts inherit null, not a secondary account's name". In practice `null` means "never set": OAuth accounts start that way because Google returns no name. Falling back to a named account of the same user gives the better default, and the name is visible and editable in the form and in Settings.
- The re-check of the fix commits found nothing.

## Not done / follow-ups

- The thread view still shows only "pre X". Showing Bcc recipients of the user's own messages in the message header would be a small UI follow-up; the data is now stored.
