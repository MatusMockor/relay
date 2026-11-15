# e2e-fixes (agent `e2e-fixes`)

Fixes for bugs found in the manual end-to-end test against a real IMAP server (GreenMail with only an INBOX). Paths touched: `packages/engine`, `packages/mail-core`, `packages/store-sqlite`, `apps/server/src/engine`, `apps/server/src/persistence/repositories/ai-jobs`, `apps/desktop/src/main/composition` and tests. Nothing in `apps/desktop/src/renderer/**` or `apps/server/src/http/**`.

## Status

Done. `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test --continue` pass across the monorepo (engine 103, mail-core 114, store-sqlite 87, server 129, desktop 122, shared 33, ai 45, mcp-mail 20, ui 5, config 8).

## Changes

### Missing special mailboxes

- Port: `MailProvider.createMailbox(name: string): Promise<RemoteMailbox>`. `name` is a top-level name. The provider puts it into the personal namespace of the server and returns the real path.
- mail-core `ImapMailProvider.createMailbox` (`src/imap/create-mailbox.ts`): `namespacedPath(name, namespace)` adds the NAMESPACE prefix and delimiter (`INBOX.` + `Archive` -> `INBOX.Archive`, `INBOX` + `.` -> `INBOX.Archive`). An already existing mailbox is returned instead of failing (GreenMail answers `NO` to a duplicate CREATE). New mailboxes are subscribed.
- Engine `RoleMailboxEnsurer` (`services/shared/role-mailbox-ensurer.ts`), shared by actions and compose. `ensure(account, role, provider)`:
  1. returns the stored mailbox with that role;
  2. otherwise uses a remote mailbox that already has the role (special-use flags or a known localized name, detected by mail-core);
  3. otherwise creates `Archive` / `Sent` / `Trash` / `Drafts`;
  4. stores it with the role and goes on.
     Concurrent calls for the same account and role share one creation.
- Used by done / undone / trash / restore (`StateMoveHandler`, only when there is something to move) and by saving sent mail (`SentMessageRecorder`, still skipped for Gmail).
- Drafts are not stored on the IMAP server yet, so nothing calls `ensure(..., 'drafts')` today. The name is ready for when drafts get mirrored.

### AI location

- `EngineOptions.settings?: { defaults?: UserSettings; pinnedAiLocation?: AiRunnerLocation }`.
- `UserSettingsReader` applies the defaults and the pin. It is used by `SettingsService`, `AiJobFactory`, `OneLinerScheduler` and `AiService.locationFor`.
- Server: `SERVER_DEFAULT_USER_SETTINGS` (`apps/server/src/engine/server-user-settings.ts`, `ai.location = 'server'`). Users without stored settings get it.
- Desktop local engine: `pinnedAiLocation: 'local'`. `settings.get` / `update` always report `ai.location = 'local'`, and jobs are always created for `local`. The `AiLocationGate` reads `services.ai.locationFor(LOCAL_USER_ID)`, so `ai.run` is never refused in local mode. `LocalRuntime.start()` calls `services.ai.relocateQueued(LOCAL_USER_ID)`, which moves jobs stuck on `server` to `local`.
- Port: `AiJobRepository.relocateQueued(userId, location, updatedAt): Promise<AiJob[]>`. It changes only `queued` jobs of that user with a different location. Implemented in the engine memory repo, `SqliteAiJobRepository` and `PgAiJobRepository`.
- `SettingsService.update` relocates the user's queued jobs when the effective location changes, and publishes `ai.job.updated` for each moved job. On the server, the `ai-queue` ticker (`JOBS_TICK_MS`) picks them up.
- New service methods: `services.ai.locationFor(userId)` and `services.ai.relocateQueued(userId)`.

### Jira task titles

- `stripJiraSubject(subject, jiraKey)` (`services/tasks/jira-task-title.ts`) is used for the title of new Jira tasks. It strips reply prefixes, `[JIRA]` tags, and a leading key (`(KEY)`, `[KEY]`, `KEY:`, `KEY -`, `Commented: (KEY)`, `Updates for KEY:`).
- A key inside the sentence is kept. Thread and message subjects are unchanged.

## Tests on real infrastructure

- mail-core `test/imap/create-mailbox.test.ts` (GreenMail plus the namespace path cases).
- server `test/mail/missing-mailboxes.e2e.test.ts` (Postgres + GreenMail, INBOX-only account):
  - done -> `Archive`, trash -> `Trash`, reply -> `Sent`;
  - mailbox roles after the actions;
  - the done view after a resync;
  - the Jira task title with the real `RuleJiraClassifier`.
- server `test/ai/ai-jobs.e2e.test.ts`: new users default to `server`, and a job queued for `local` runs on the server after the user switches.
- `test/persistence/ai-job-queue.test.ts` (Postgres) and store-sqlite `test/ai-job-queue.test.ts`: `relocateQueued`.
- desktop `test/main/local-missing-mailboxes.e2e.test.ts` (SQLite + GreenMail): the same mailbox flow over IPC, the Jira title, and adopting stuck `server` jobs on start.
- desktop `test/main/local-ai-oauth.e2e.test.ts`: the old "refuses local AI when the setting says server" test now expects a local run.

## Review (gpt-6.1-sol, read-only, `cec31a6..HEAD`)

It found 4 issues. 3 are fixed, each with a regression test:

- A job relocated between `listQueued` and `claim` could still run on the old runner. `AiJobClaim.location?` is new, `AiJobLease` sets it, and both stores and the memory repo claim only jobs at that location.
- A sync whose mailbox list was taken before an action created `Archive` deleted the new mailbox row and its messages (`deleteMissing` with the stale list). `MailboxRefresher` now reads the stored mailboxes before the remote list, and keeps (and syncs) mailboxes stored after its snapshot. Regression test in `role-mailboxes.test.ts`; it fails without the fix.
- An existing `\Noselect` folder named `Archive` was returned as the destination. `createMailbox` now throws `ProviderError` ("exists but cannot hold messages"); covered on GreenMail with a `\Noselect` parent. The action stays local and the failure is logged.

Not fixed (known gap): settings save and job relocation are not one transaction. If two location switches overlap, or a job is created with the old location right after relocation finished, a job can stay at the old location until the next switch. Fixing it needs a transactional protocol across settings and job creation. On the desktop, `start()` adopts such jobs.

## Known gaps

- Existing server users who saved settings while the default was `local` keep `local` until they switch. Their queued jobs move as soon as they do.
- The settings / relocation race above.
- A tiny window is left in the mailbox race: an action that creates and stores a mailbox between the refresher's second read and `deleteMissing`.
- The renderer may still offer the AI location switch in local mode. The engine ignores it there and reports `local`.
- A `\Noselect` folder with the default name blocks creating that role mailbox. The action then stays local and a warning is logged.
