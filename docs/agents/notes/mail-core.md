# mail-core (agent `mail-core`)

Owner of `packages/mail-core/**`.

## Status

Done. All adapters are implemented and green: `pnpm --filter @relay/mail-core lint`, `typecheck` and `test` (13 files, 106 tests, GreenMail + a local `node:http` Google token stub). A gpt-6.1-sol review was run and all 6 findings were fixed (see the review fixes under Decisions).

## Ready for others (all from `@relay/mail-core`)

Engine port adapters:

- `DefaultMailProviderFactory` (`MailProviderFactory`): `new DefaultMailProviderFactory({ tokens: OAuthTokenProvider, timeouts?, tls?, provider?: { fetchBatchSize?, idle? } })`. It creates an `ImapMailProvider` for password or XOAUTH2 (gmail/outlook) credentials. Tokens are resolved again on every (re)connect.
- `ImapMailProvider` (`MailProvider`, imapflow). Notes:
  - `listMailboxes` skips `\Noselect` / `\NonExistent` entries. Roles come from server special-use flags (`\Sent`, `\Drafts`, `\Trash`, `\Junk`, `\Archive`, `\All` -> archive), then from names (EN/SK/CS/DE, diacritics-insensitive, so `[Gmail]/All Mail` -> archive).
  - `fetchSince` searches UIDs > `lastUid` when UIDVALIDITY matches, otherwise refetches everything. It fetches in batches (default 50) under short mailbox locks, so the consumer can call other provider methods while iterating.
  - `fetchFlagChanges` uses `CHANGEDSINCE` when the server has CONDSTORE. Without it (GreenMail, many small hosts) it returns the flags of every message. `status().highestModseq` is `null` in that case.
  - `listUids` is for expunge detection. `move` returns the UIDPLUS uid map, or an empty map when the server doesn't send one. `append` returns uid/uidValidity, or nulls.
  - Reads and flag stores retry once on a dropped connection. `move` and `append` never retry, to avoid duplicates. Errors are `ProviderError`.
  - `idle()` opens a dedicated read-only connection. It reconnects with exponential backoff, and after a reconnect it emits `{ type: 'exists', count }` so the engine resyncs. The disposer stops it for good. `close()` disposes all watchers.
- `SmtpMailSender` (`MailSender`, nodemailer): `new SmtpMailSender({ tokens, timeouts?, tls? })`. It builds the MIME once with MailComposer (Message-ID, In-Reply-To, References, attachments from `OutgoingMessage.attachments`) and sends exactly those bytes. `SentMessage.raw` is the same MIME, without the Bcc header, ready for `MailProvider.append(sent, raw, { seen: true })`. `verify()` checks the connection.
- `MailparserMessageParser` (`MessageParser`): `new MailparserMessageParser(clock)`. The clock is only the fallback when the Date header is missing.
  - All headers go into `headers` (lowercase names, unfolded raw values), Jira headers included.
  - Message-IDs keep their angle brackets (`<id@host>`). `references` is deduplicated and in order.
  - Invalid addresses are dropped. `textBody` is `null` when empty.
  - The snippet is about 160 chars and skips quotes (`>`, `On ... wrote:`, `.gmail_quote`, `blockquote[type=cite]`, Outlook `#divRplyFwdMsg`) and signatures.
  - Attachment `contentId` has no angle brackets, so it matches `cid:` URLs.
- `ReferencesThreadResolver` (`ThreadResolver`): `new ReferencesThreadResolver(lookup: ThreadLookup, ids: IdGenerator, { subjectWindowDays? = 14 })`. It looks up In-Reply-To first, then References from newest to oldest, then its own Message-ID. After that it falls back to the normalized subject (Re/Fwd/AW/Odp/... and `[EXTERNAL]` stripped), but only for replies (a reply prefix, or In-Reply-To/References set) inside the window.
  - `MessageRepositoryThreadLookup(messageRepository, subjectFinder?)` adapts the engine `MessageRepository.findByMessageIdHeaders`. See the request below.
- `RuleJiraClassifier` (`JiraClassifier`): `new RuleJiraClassifier({ senderAddresses?, senderDomains? })` for self-hosted Jira.
  - Detection: an `X-JIRA-*` header, `jira@*.atlassian.net`, a `jira@` local part, a sender name ending in `(Jira)`, a `<JIRA.` Message-ID, or a `[JIRA]` subject tag.
  - The key comes from `(KEY-1)`, then a bare `KEY-1` in the subject, then a `/browse/KEY-1` link in the body.
  - Kinds are mention > assigned > status > comment > other, matched in EN/SK/CS, subject first, then the first 400 body chars. A Jira mail without a key returns `null`.
- `RuleSplitMatcher` (`SplitMatcher`): handles all 5 rule kinds.
  - `fromDomain` also matches subdomains, and a leading `@` is ok. `fromAddress` is case-insensitive.
  - `subjectRegex` honors `caseSensitive`. `header` uses a case-insensitive regex on any value.
  - `jira` with empty `projectKeys` matches any Jira mail.
  - An invalid regex never matches. Results come back in `split.order`.

OAuth:

- `OAuthTokenProvider` / `OAuthTokenRefresher` strategies. `RefreshingOAuthTokenProvider({ refreshers: { gmail: GoogleOAuthTokenRefresher }, vault: CredentialVault, clock, expirySkewSeconds? = 60 })` reads the newest credentials from the vault, refreshes when they are expired or close to expiry (one refresh per account even with concurrent callers), and writes the refreshed credentials back to the vault.
- `GoogleOAuthTokenRefresher(config: GoogleOAuthClientConfig, clock, fetch?)`, where `GoogleOAuthClientConfig = { clientId, clientSecret: string | null, tokenEndpoint? }`. The config is injected and nothing is hardcoded.
- Pure helpers for loopback + PKCE (both modes):
  - `createPkcePair()` returns `{ codeVerifier, codeChallenge, codeChallengeMethod: 'S256' }`. There are also `createPkceChallenge(verifier)` and `createOAuthState()`.
  - `buildGoogleAuthUrl({ clientId, redirectUri, codeChallenge, state, loginHint? })` asks for the scopes `https://mail.google.com/ openid email` with `access_type=offline` and `prompt=consent`.
  - `exchangeGoogleCode({ config, code, codeVerifier, redirectUri, now?, fetch? })` returns `{ credentials: OAuthCredentials, email }`. The email comes from the id_token. It throws `ProviderError` when there is no refresh token.

Presets (for "Pridať účet"):

- `providerPresets` and `listProviderPresets()` cover gmail, outlook (office365), icloud, yahoo, seznam and websupport. Each preset has `{ id, label, provider, domains, imap, smtp, supportsOAuth, requiresAppPassword }`.
- `findPresetByDomain(domain)` finds a preset by domain.
- `guessSettings(email)` returns `{ presetId, provider, settings: ImapSmtpSettings, confidence: 'preset' | 'heuristic' }` or `null`. Without a preset it guesses `imap.<domain>:993` TLS and `smtp.<domain>:465` TLS.

Smaller exports: `detectMailboxRole`, `normalizeSubject`, `relatedMessageIds`, `extractJiraKey`, `detectJiraEventKind`, `buildSnippet`, `htmlToText`, `composeMime`, `ImapClientFactory`, `CredentialsMailAuthResolver`, default timeouts.

## Requests

- engine (or orchestrator, ports are frozen): subject fallback threading needs a lookup. I propose adding this to `MessageRepository`:
  `findThreadIdBySubject(accountId: AccountId, normalizedSubject: string, window: { since: Date; until: Date }): Promise<ThreadId | null>`.
  It needs a normalized subject stored per message (use `normalizeSubject(subject).value` from `@relay/mail-core`). Until then, `MessageRepositoryThreadLookup` takes an optional `subjectFinder` function and otherwise threads by Message-ID / References only.
- orchestrator / infra: the GreenMail test container accepts ANY password and any XOAUTH2 token (checked with a wrong password for an existing and for a non-existing user). Tests can't check auth rejection against it. mail-core tests the failure path with an unreachable port instead.

## Decisions

- Dependency added: `zod@4.1.13` in `@relay/mail-core` (validates the Google token endpoint responses). `pnpm-lock.yaml` was updated.
- Message-ID values keep their angle brackets everywhere (parser output, SMTP `messageIdHeader`, thread lookup), so repositories should store and query them as is.
- Composition roots wire it like this:
  - `tokens = new RefreshingOAuthTokenProvider({ refreshers: { gmail: new GoogleOAuthTokenRefresher({ clientId, clientSecret, }, clock) }, vault, clock })`
  - `new DefaultMailProviderFactory({ tokens })`
  - `new SmtpMailSender({ tokens })`
  - `new MailparserMessageParser(clock)`
  - `new ReferencesThreadResolver(new MessageRepositoryThreadLookup(messageRepository), ids)`
  - `new RuleJiraClassifier()`
  - `new RuleSplitMatcher()`
- Desktop loopback client: Google desktop clients use `clientSecret` from the downloaded client JSON (it is not secret for installed apps). Pass `null` if you don't have one.

- Review fixes:
  - Plaintext auth is refused by default. A non-TLS endpoint (`secure: false`) must upgrade with STARTTLS (ImapFlow `doSTARTTLS`, nodemailer `requireTLS`). Set `allowPlaintext: true` on `DefaultMailProviderFactory` / `SmtpMailSender` only for local test servers (GreenMail).
  - `fetchSince` throws `ProviderError` when UIDVALIDITY changes between batches. The engine should restart the sync of that mailbox from `status()`.
  - Split regexes: `isUnsafeRegex(pattern)` (exported) rejects nested quantifiers, quantified alternations and backreferences, so they never match. Inputs are capped at `MAX_MATCH_INPUT_LENGTH` (2000). Request to the engine `SplitService`: call `isUnsafeRegex` when validating `subjectRegex` / `header` rules, so users get a validation error instead of a silent non-match.
  - `normalizeSubject` is iterative and bounded (1000 chars, 50 prefixes). An invalid INTERNALDATE falls back to the epoch instead of failing the batch. `ImapConnection.close()` waits for a pending connect.

- Git: my review-fix changeset (STARTTLS, regex guard, UIDVALIDITY check, subject normalization, plaintext-auth tests, this note) ended up inside commit `435c60f feat(server): add AI job endpoints...`. Another agent committed the shared index while my files were staged. The content is correct. The orchestrator may want to re-attribute it when splitting PRs. Own mail-core commits: `1dd2362`, `0337067`, `d4433f0` and this note update.

## Known gaps

- Gmail labels (`X-GM-LABELS`) aren't used. Keywords go through standard IMAP flags, and Gmail may not keep custom keywords. "Done" works by moving to the `\All` mailbox (`archive` role).
- No Outlook OAuth refresher yet. An Outlook account with expired tokens gets `ProviderError` "No OAuth token refresher configured".
- CONDSTORE `CHANGEDSINCE` is implemented but only tested on the fallback path, because GreenMail has no CONDSTORE.
