# server-data (Postgres persistence for apps/server)

## Status

DONE. Schema + migrations, migration runner, server ports, all Postgres repositories, `PgUnitOfWork`, `AesGcmCredentialVault`, `PgAttachmentStore`, `PersistenceModule`, `createTestDatabase()`, 18 integration test files (83 tests) against real Postgres, one database per test file (`pnpm --filter @relay/server exec vitest run test/persistence`).

Reviewed by gpt-6.1-sol (read-only, `codex exec`; the CodeRabbit CLI is not installed on this machine). All 5 findings were fixed with tests: ownership of referenced rows, refresh token rotate/revoke race, sync state mailbox/account mismatch, concurrent split replacement, concurrent primary switch.

## Owned paths

`apps/server/src/persistence/**`, `apps/server/src/core/**`, `apps/server/drizzle/**`,
`apps/server/drizzle.config.ts`, `apps/server/test/persistence/**`.

## Ready for others

### Nest wiring - `apps/server/src/persistence/persistence.module.ts`

```ts
import { PersistenceModule } from './persistence/persistence.module';

@Module({ imports: [ConfigModule.forRoot(...), PersistenceModule.forRoot(), ...] })
```

- `@Global()`, so every module can inject the exported tokens without importing it.
- `forRoot()` reads through `ConfigService.get(key)` (validated env first, then `process.env`):
  - `DATABASE_URL` (required, postgres url)
  - `CREDENTIALS_ENCRYPTION_KEY` (required, base64 of exactly 32 bytes)
  - `DATABASE_MIGRATE_ON_START` (`true` / `false`, default `true`)
  - `DATABASE_POOL_MAX` (default `10`)
- `forRoot({ config })` takes an explicit `PersistenceConfig` (`{ databaseUrl, credentialsKey: Buffer, migrateOnStart, maxConnections, migrationsFolder? }`). In e2e tests you can also `overrideProvider(PERSISTENCE_CONFIG).useValue(...)`.
- Migrations run inside the async connection factory, so any provider that injects a repository gets an already migrated database (no `onModuleInit` ordering issues). A Postgres advisory lock makes concurrent starts safe.
- The pool is closed in `onApplicationShutdown` (`app.close()` triggers it).

Exported tokens:

- engine: `PORT_TOKENS.AccountRepository`, `MailboxRepository`, `MessageRepository`, `ThreadRepository`, `LabelRepository`, `SplitRepository`, `TaskRepository`, `ReminderRepository`, `DraftRepository`, `ScheduledSendRepository`, `SettingsRepository`, `AiResultRepository`, `AiJobRepository`, `SyncStateRepository`, `UnitOfWork`, `CredentialVault`, `AttachmentStore`.
- server (`apps/server/src/core/tokens.ts`): `SERVER_PORT_TOKENS.UserRepository`, `DeviceRepository`, `RefreshTokenRepository`, `ServerUnitOfWork`.
- infra (`apps/server/src/persistence/persistence.tokens.ts`): `PERSISTENCE_CONFIG`, `PG_POOL` (`pg.Pool`, e.g. for pg-boss `db` option or health checks), `DRIZZLE_DB`.

`PORT_TOKENS.UnitOfWork` and `SERVER_PORT_TOKENS.ServerUnitOfWork` are the same `PgUnitOfWork` instance. `ServerUnitOfWork.run(work)` hands `work` a `ServerRepositories` = engine `Repositories` + `users`, `devices`, `refreshTokens`, all bound to one transaction (use it for register: user + device + refresh token + settings atomically).

### Server ports - `apps/server/src/core` (types from `src/core/ports`, `src/core/model`)

```ts
interface UserRepository {
  create(user: User, passwordHash: string): Promise<User>; // ConflictError on duplicate email (case-insensitive)
  findByEmail(email: string): Promise<StoredUser | null>; // { user, passwordHash }, case-insensitive
  findById(userId: UserId): Promise<User | null>;
}
interface DeviceRepository {
  create(device: Device): Promise<Device>;
  findActive(userId: UserId, deviceId: DeviceId): Promise<Device | null>; // null when revoked
  listForUser(userId: UserId): Promise<Device[]>; // non-revoked, lastSeenAt desc
  touch(deviceId: DeviceId, lastSeenAt: string): Promise<void>;
  revoke(userId: UserId, deviceId: DeviceId, revokedAt: string): Promise<boolean>;
}
interface RefreshTokenRepository {
  store(token: NewRefreshToken): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>; // any state, for reuse detection
  findValid(tokenHash: string, now: string): Promise<RefreshTokenRecord | null>; // not rotated/revoked/expired, device not revoked
  rotate(currentId: string, next: NewRefreshToken, now: string): Promise<RefreshTokenRecord | null>; // atomic, null if current was already rotated/revoked (race / reuse)
  revokeFamily(familyId: string, revokedAt: string): Promise<void>;
  revokeDevice(deviceId: DeviceId, revokedAt: string): Promise<void>;
}
```

`RefreshTokenRecord = { id, userId, deviceId, familyId, tokenHash, expiresAt, createdAt, rotatedAt, revokedAt }`, `NewRefreshToken` = without `rotatedAt`/`revokedAt`. The repository stores whatever hash you give it (your HMAC-SHA256), it never sees the raw token. With your "family = device" decision just use `familyId = deviceId`. Revoking a device makes all its tokens invalid in `findValid` even before `revokeDevice` runs.

### Test helper - `apps/server/test/persistence/support/test-database.ts`

```ts
import { createTestDatabase, type TestDatabase } from '../persistence/support/test-database';

const database = await createTestDatabase(); // creates relay_test_<random> on TEST_DATABASE_URL (default postgres://relay:relay@127.0.0.1:5433/relay_test) and migrates it
database.url; // postgres url of the new database
await database.drop(); // DROP DATABASE ... WITH (FORCE)
```

Options: `{ adminUrl?, migrate? }` (`migrate: false` leaves it empty). For e2e: set `process.env.DATABASE_URL = database.url` and a `CREDENTIALS_ENCRYPTION_KEY` (e.g. `randomBytes(32).toString('base64')`) before `createApp()`.

### Other exports (`apps/server/src/persistence/index.ts`)

`runMigrations({ databaseUrl, migrationsFolder? })`, `openPostgresConnection({ url, maxConnections? })`, `createPgRepositories(db)`, `PgUnitOfWork`, `AesGcmCipher`, `AesGcmCredentialVault`, `PgAccountCredentialStore`, `CredentialDecryptionError`, `PgAttachmentStore`, `parsePersistenceConfig`, `PersistenceEnvSchema`.

## Behaviour others must know (engine / server-api)

- `ThreadSummary.labelIds` is derived (distinct labels of the thread's messages via `message_labels`) and `hasDraft` is derived (a draft with `inReplyToThreadId = thread.id` exists). `ThreadRepository.upsert` ignores those two input fields and returns the stored view. `splitIds` is stored (`thread_splits`), only splits owned by the same user are kept.
- `Message.labelIds` is stored in `message_labels` by `MessageRepository.upsert` / `updateLabels`; labels of a different account are silently dropped.
- `messages.thread_id` has no FK to `threads` (messages may be written before their thread in a sync batch). `ThreadRepository.delete` does not delete messages.
- `MailboxRepository.upsertMany` upserts on `(accountId, path)`: existing rows keep their id and counts (name, delimiter, role are updated). Use the returned mailboxes (real ids).
- `SplitRepository.replaceAll` upserts by id and deletes the missing ones, so `thread_splits` of kept splits survive.
- `ThreadRepository.queryFolder` ordering: `lastMessageAt desc, id desc`, opaque base64url cursor; an invalid cursor throws `ValidationError`. Views: `inbox` = state inbox (without `splitId`, threads in an exclusive split are excluded), `done`, `trash`, `reminders` = state reminder, `tasks` = has a non-done task, `sent` = has a message in a `sent` mailbox, `drafts` = has a reply draft, `scheduled` = has a pending scheduled send of a reply draft (the last four exclude trash). Filters: `accountId` (null = unified), `splitId`, `labelId`, `search`.
- Search: `messages.search_vector` (generated, GIN) over subject (A), from/to/cc names + emails (B), text body or snippet (D), `simple` config + `unaccent`, `@ . _ / : + -` split words. Queries are prefix matches of every term (`fakt` finds `Faktúra`), diacritics-insensitive both ways.
- `TaskRepository.list` order: `updatedAt desc, id desc`. `ReminderRepository`: one active (unfired) reminder per thread (unique), `ConflictError` otherwise.
- `CredentialVault`: envelope `v1.<iv>.<tag>.<ciphertext>` (base64url, AES-256-GCM, 12 byte IV, AAD = account id, so blobs can't be swapped between accounts). Tampering, a wrong key or invalid content throws `CredentialDecryptionError` (`EngineError` code `internal`). `set` for an unknown account throws `NotFoundError`.
- Attachment ids from `PgAttachmentStore.put` are generated by Postgres (32 hex chars).
- Writes that reference other rows check that those rows belong to the same user and throw `NotFoundError(<Entity>, id)` otherwise: drafts (account, reply thread, reply message), reminders / tasks / AI results (thread), scheduled sends (account, draft), splits (account), sync state (mailbox must belong to `accountId`). Upserting a thread, message, label, task or reminder whose id belongs to another user throws `ConflictError`.
- `RefreshTokenRepository.rotate` and `revokeFamily` take a per-family transaction advisory lock, so a revocation during a rotation can't leave a valid successor. `rotate` also requires `next.familyId` to equal the current token's family (returns `null` otherwise).
- `SplitRepository.replaceAll` and primary-account changes lock the user row, so concurrent calls serialize instead of merging or hitting the unique index.
- Deleting a mailbox (`deleteMissing`) cascades its messages and sync state. Threads are not touched, so the engine should recompute or delete threads of the affected mailbox.

## Requests

- server-api: `test/mail/mail.e2e.test.ts` currently fails with `401 Invalid or expired access token` on `GET /threads` right after `travel(2 * HOUR)`. The fake clock moves past the 15 min access token TTL. Refresh the token after `travel` or use a longer TTL in that test. It's not a persistence issue.

- Orchestrator / server-api: `DATABASE_MIGRATE_ON_START` and `DATABASE_POOL_MAX` are read via `ConfigService` fallback to `process.env`; adding them to `EnvSchema` (`z.stringbool().default(true)`, `z.coerce.number().int().positive().default(10)`) would make them part of the validated env. Not blocking.
