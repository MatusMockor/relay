# ux-fixes (agent `ux-fixes`)

Fixes for the findings from the orchestrator's manual test (server + renderer + Electron on Linux with GreenMail). Nothing under the `remote-ai` paths (`packages/engine/src/services/ai/**`, `packages/shared/src/api/endpoints/ai*`, `apps/server/src/ai/**`, `apps/desktop/src/main/ai/**`) was changed.

## Status

Done. Lint, typecheck and tests pass for every package I touched. `pnpm format:check` and `pnpm test --continue` pass for the whole monorepo.

## Changes

### 1. AI summary and reply suggestions when a thread is opened

- Shared: `ThreadAiKind` (`summary | replySuggestions`), `ThreadAiState { pending: ThreadAiKind[] }`. Endpoint `api.threads.prepareAi` (`POST /threads/:id/ai/prepare`) and IPC channel `local.threads.prepareAi` (`{ threadId }`). Both return `ThreadAiState`.
- Port: `AiJobRepository.hasPending(userId, kind, threadId)` returns true for `queued` or `running` jobs. Implemented in the engine memory repo, `SqliteAiJobRepository` and `PgAiJobRepository`, next to `hasQueued`, with a shared private `hasIn(statuses, ...)`.
- Engine `ThreadAiPreparer` (`services/threads/thread-ai-preparer.ts`), exposed as `services.threadAi.prepare(userId, threadId)`. For each enabled kind (`threadAiKinds`) it:
  1. reports a queued or running job as pending;
  2. skips the kind when a result was created at or after the latest message's date;
  3. otherwise queues a job through `AiService.createJob` (the public API, so feature gates, location and `ai.job.updated` stay as they are) and reports it as pending.
     Reply suggestions are skipped for Jira threads and when the latest message comes from the account itself. One failed kind is logged and does not stop the other. An unknown thread throws `NotFoundError`.
- Server: `ThreadsController.prepareAi`, with `ThreadAiPreparer` bound in `EngineModule`. Desktop main: the `local.threads.prepareAi` handler.
- Renderer:
  - `MailClient.prepareThreadAi`, implemented by the remote, local and demo clients.
  - `useThreadAiPending(thread)` is keyed by `['mail', 'threads', 'ai', id, lastMessageAt]` with `staleTime: Infinity`, no retries and no refetch on focus. It runs once per opened thread and again only after a new message arrives.
  - `applyAiJobUpdate` (`ai.job.updated`): on `done` / `error` of `summary` / `replySuggestions` it drops the kind from the pending cache. On `done` it also invalidates the thread detail. The prepare query is never invalidated, so a failing job cannot cause an enqueue loop.
  - `AiSummary` shows the prototype's quiet `t-sum wait` state ("AI pripravuje zhrnutie…", or the one-liner plus "AI dopĺňa podrobnosti…"). `NextActions` shows "AI pripravuje návrhy odpovedí…" until the 3 pills arrive.

### 2. Onboarding

- `SessionController.authenticate` lists the server accounts with the fresh token before it enters synced mode. It shows "Pridať e-mailový účet" only when the list is empty, or when the call fails, which keeps the old behaviour.
- `continueOffline` (local mode) does the same with the local client. It passes through `phase: 'booting'` while it checks, so neither the inbox nor the account step flashes.

### 3. Account form

- `AddAccountForm.run` clears the error and the old test result at the start of every valid test or submit. A validation error clears the old test result.
- A regression test covers a failed submit followed by a successful test. It fails without the fix.

### 4. Jira display

- `stripJiraSubject` moved from the engine (`services/tasks/jira-task-title.ts`) to `@relay/shared/domain` (`domain/jira-subject.ts`), together with `displaySubject(subject, jiraKey)`, which falls back to the full subject when nothing is left. The engine task planner imports it from shared.
- mail-core `extractJiraActor(subject, body, from)` (`src/jira/jira-actor.ts`, exported):
  - it checks the first 6 body lines, then the subject without `[JIRA]` / `(KEY)`, but only when the subject itself reads as a Jira event (so an issue title like "Login changed behaviour" is not taken as an actor);
  - it looks for `<Name> [vás|ti|...] <verb>` with English, Slovak and Czech verbs (mentioned, assigned, changed, commented, created, spomenul, priradil, zmenil, okomentoval, pridal, vytvoril, přiřadil, změnil, ...);
  - otherwise it uses a `Name (Jira)` sender name;
  - plain "Jira" senders give `null`.
- `JiraClassification.actor: string | null`. `RuleJiraClassifier` fills it.
- `ThreadSummary.jiraActor: string | null`. The schema defaults to `null`, so older payloads still parse.
  - The engine change set and projector keep the latest detected actor and otherwise keep the previous one.
  - Columns `threads.jira_actor` in SQLite (`0003_jira_actor.sql`) and Postgres (`0003_jira_actor.sql`), with mappers.
- UI:
  - List row: the actor is the sender, followed by a subtle `Jira` tag (`small.via`). The subject comes from `displaySubject`, and the key chip stays.
  - Thread view: the `h1` uses `displaySubject`.
  - Contact pane: the actor's name and avatar, `Jira · <sender email>`, and related threads by the same actor.
  - The demo seed sets the actor for Jira threads.

### 5. App identity

- `apps/desktop/package.json` has `"productName": "Relay"`. Electron prefers it over `name`. With the real Electron 45 binary, `app.getName()` returns `Relay` and `userData` is `~/.config/Relay`.
- The menu uses `app.getName()`. The window title and `index.html` already say Relay, and `electron-builder.yml` already had `productName: Relay`.
- `src/main/index.ts` was not touched, because `remote-ai` was editing it. `app.setName` is not needed.

## Tests on real infrastructure

- engine `test/services/thread-ai-prepare.test.ts`: once per latest message, no duplicate while a job is running, a new message queues again, Jira and own-message cases, features off, unknown thread.
- store-sqlite `test/ai-job-queue.test.ts` and server `test/persistence/ai-job-queue.test.ts` (Postgres): `hasPending`. Thread round trips with `jiraActor` in both stores.
- server `test/threads/thread-ai.e2e.test.ts` (Postgres + GreenMail + a stub Claude that answers per task, `test/support/stub-claude-by-task.ts`):
  - prepare queues once, pg-boss runs both jobs, the detail has the summary, the checklist and 3 suggestions;
  - `ai.job.updated` arrives over WebSocket;
  - prepare is then empty;
  - a real Jira mail gets `jiraActor`;
  - an unknown thread returns 404.
- desktop `test/main/local-thread-ai.e2e.test.ts` (SQLite + GreenMail + stub Claude CLI): the same flow over IPC in local mode, plus `jiraActor`. The desktop stub Claude now also answers reply suggestion prompts.
- mail-core `test/jira/rule-jira-classifier.test.ts`: the actor for every fixture, English and Slovak body lines, the `(Jira)` sender fallback, and `null` for plain senders.
- renderer:
  - `test/thread-ai.test.tsx` (contract server + WebSocket): pending states, filled in from `ai.job.updated`, a single prepare call, and the Jira row, heading and contact;
  - `test/onboarding.test.tsx`: a login with existing accounts goes to the inbox, and the stale form error regression.
- desktop `test/main/app-identity.test.ts`: `productName` in `package.json` and `electron-builder.yml`.

## Review

- The read-only gpt-6.1-sol review (`codex exec -m gpt-6.1-sol -s read-only`) did not run. Codex hung with no output, even on a one-line prompt (3 min timeout); the full review hit its 40 min limit. The orchestrator should rerun it on `870b832 aec72fd dd4f8f7 c7305bd f6f61db f12cc41 e27f9f0` plus the actor fix.
- My own review found that a subject like `(CMS-217) Login changed behaviour` gave the actor "Login". Fixed with the event-phrase rule above, with a regression test.

## Known gaps

- Existing local data in `~/.config/@relay/desktop` is not migrated to `~/.config/Relay`. Dev builds start with an empty local store. If that matters, `src/main/index.ts` (owned by `remote-ai` at the moment) can move the old folder before `ready`.
- Fixed by `review-fixes`: a job that finishes before the prepare response, or while the WebSocket is down, no longer leaves the pending hint stuck.
- Reply suggestions for automated non-Jira senders (newsletters) are still queued on open, because stored messages have no headers. The UI hides them for automated senders (`isAutomated`), as before.
- Existing Jira threads get `jiraActor` only when their next Jira notification is synced.
- Fixed by `review-fixes`: concurrent prepares queue one job per kind (`enqueueIfAbsent` + partial unique index).
