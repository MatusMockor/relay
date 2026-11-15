# store-sqlite agent note

Owner of `packages/store-sqlite/**`.

## Status

DONE. Lint, typecheck and 73 tests green (`pnpm --filter @relay/store-sqlite lint|typecheck|test`).

## Ready for others (exports of `@relay/store-sqlite`)

- `openDatabase(path, { readonly?, busyTimeoutMs? }): SqliteDatabase` - better-sqlite3 + Drizzle, `foreign_keys = ON`, `busy_timeout` 5 s, WAL + `synchronous = NORMAL` for file databases. `SqliteDatabase` has `sqlite`, `db`, `queue`, `transactions`, `close()`. Use ONE `SqliteDatabase` per process (all serialization happens on it).
- `migrate(database, { migrationsFolder? })` - runs drizzle-kit migrations. Default folder: `SQLITE_MIGRATIONS_FOLDER` (= `packages/store-sqlite/drizzle`, resolved from `import.meta.url`).
- `createSqliteRepositories(database): Repositories` - the engine `Repositories` shape, one class per port (`SqliteAccountRepository`, ... `SqliteSyncStateRepository`).
- `new SqliteUnitOfWork(database): UnitOfWork`.
- `LOCAL_USER_ID` (`'local'` as `UserId`).

Minimal wiring (desktop composition root):

```ts
const database = openDatabase(join(app.getPath('userData'), 'relay.db'));
migrate(database, { migrationsFolder });
const repositories = createSqliteRepositories(database);
const unitOfWork = new SqliteUnitOfWork(database);
```

## Requests

- desktop-main: electron-vite bundles this package into `out/main`, so `import.meta.url` no longer points at the package. Ship `packages/store-sqlite/drizzle` with the app (electron-builder `extraResources`, and copy it next to the bundle for `electron-vite dev`) and pass `migrationsFolder` explicitly. In Vitest / vite-node the default works.
- orchestrator: my first implementation commit was swept into commit `5260bc1` ("feat(ai): ...") because another agent committed while my files were staged in the shared index. Content is complete; when splitting PRs, the `packages/store-sqlite/**` part of `5260bc1` belongs to store-sqlite. Since then I commit with explicit pathspecs (`git commit -- <paths>`), other agents should do the same.
- orchestrator: CodeRabbit CLI is not installed in this environment, so no automated review was run.

## Decisions others must know

- Errors: unique / primary key violations -> `ConflictError`, foreign key violations -> `ValidationError`, invalid cursor or page limit -> `ValidationError`, unknown account on `threads.upsert` / `messages.upsert` / `accounts.setPrimary` -> `NotFoundError`.
- Unit of work: units are serialized through a per-connection queue with `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. Every repository call is atomic on its own (a savepoint inside a unit), so a caught failing statement does not abort the unit. Plain (non-transactional) repository calls wait until an open unit finishes. Inside a unit, nested `unitOfWork.run` and plain repository calls JOIN the open transaction (AsyncLocalStorage), so they never deadlock and roll back with it. Using unit-bound repositories after the unit finished rejects. Do not keep a unit open across slow I/O (IMAP/SMTP/AI): it blocks all other DB access in the process.
- Threads: `threads.upsert` stores the summary as given (round-trip): `labelIds`, `hasDraft`, `unread`, `splitIds` are what the engine passes. The user id is taken from the account. `labels.delete` strips the label from `threads.labelIds`; `splits.replaceAll` removes memberships of dropped splits. `threads.delete` also deletes the thread's messages.
- `queryFolder` views: `inbox` / `done` / `trash` / `reminders` = thread `state` (`reminders` -> state `reminder`); main `inbox` (no `splitId`) hides threads in an `exclusive` split; `tasks` = has a task that is not `done`; `sent` = has a message in a mailbox with role `sent`; `drafts` = a draft row with `inReplyToThreadId` = thread; `scheduled` = a `pending`/`sending` scheduled send of such a draft. The last four exclude trashed threads. All views sort by `lastMessageAt desc, id desc` (instants, offsets normalized); the cursor is opaque base64url.
- Search: FTS5 over subject, sender name + email, snippet and text body, tokenizer `unicode61 remove_diacritics 2`. Each whitespace-separated term becomes a quoted prefix term (AND), FTS syntax in input is treated as text, a query without letters/digits means no filter.
- Messages: `labelIds` live in `message_labels` (FK to `labels`, so labels must exist before the message is upserted). Message headers are stored for `listMatchSubjects` (cursor pagination by insertion order).
- `accounts.listSyncable()` = every account whose status is not `disconnected` (all users). `accounts.create` / `update` with `isPrimary: true` clears the flag on the user's other accounts.
- `tasks.list` is ordered by `updatedAt desc, id desc`; one task per `(userId, jiraKey)`.
- `reminders.listDue` / `scheduledSends.listDue` compare instants and order by due time; `scheduledSends.claim` moves `pending` -> `sending` exactly once.
- Added dependency: `zod@4.1.13` (same version as `@relay/shared`) to validate stored JSON (message headers, cursors).
- Schema changes: edit `src/schema/*`, run `pnpm --filter @relay/store-sqlite db:generate`, commit the new files in `drizzle/`. FTS table and triggers live in the custom migration `drizzle/0001_fts.sql`.

## Known gaps

- `reminders` view is sorted by last message, not by `remindAt`.
- No `VACUUM` / FTS `optimize` maintenance task yet.
- Label filter scans `json_each(label_ids)` (fine for local mailbox sizes).
