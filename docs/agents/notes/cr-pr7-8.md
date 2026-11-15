STATUS: DONE

# cr-pr7-8 (agent `cr-pr7-8`)

CodeRabbit findings on the SQLite store PR (pr7) and the server persistence PR (pr8), plus request A from `cr-pr9.md` (mail tools after a reclaim) and request B (auth rate limit docs). Commits on `feat/mvp-core`: `0457b82` (SQLite), `15b0f7d` (Postgres), `9043964` (proxy hops + docs), `5a9f42a` (request A). Every fix has a test that fails without it, unless noted.

## Findings

| #   | Where                                                         | Verdict | What changed                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | `store-sqlite/.../backfill-normalized-subjects.ts:24`         | VALID   | Pages by `seq > lastSeq ORDER BY seq`. Performance only, so no failing test. A new test covers a backfill across 3 batches (1201 rows).                                                                                                                         |
| 7.2 | `store-sqlite/.../fts-match-expression.ts:11`                 | VALID   | `"` becomes a space before the split. `27"monitor` matches again.                                                                                                                                                                                               |
| 7.3 | `store-sqlite/src/sqlite-unit-of-work.ts:27`                  | VALID   | `runInOpenTransaction` rejects when `sqlite.inTransaction` is false. Used by `TransactionExecutor` and by `QueuedExecutor` inside an active unit (that path had the same gap). Test: a temp trigger with `RAISE(ROLLBACK)`, then writes through both executors. |
| 7.4 | `store-sqlite/test/thread-search.test.ts:106`                 | VALID   | Checks `oktober`. Test-only.                                                                                                                                                                                                                                    |
| 7.5 | `store-sqlite/test/unit-of-work-file.test.ts:42`              | VALID   | A `created` deferred replaces the timer. Test-only.                                                                                                                                                                                                             |
| 8.1 | `server/.../postgres-connection.ts:21`                        | VALID   | `acquire` / `release` add and remove the error listener on checked-out clients. `onIdleClientError` is now `onClientError`. Test: terminate the backend inside `db.transaction` (without the fix vitest reports unhandled `error` events).                      |
| 8.2 | `server/.../pg-account-repository.ts:60`                      | SKIP    | Valid, but the gap is in the engine (`AccountRegistration.register` deletes only the new account when `vault.set` fails). Not my area (engine only for request A). Fix below.                                                                                   |
| 8.3 | `server/.../pg-draft-repository.ts:90`                        | SKIP    | Already fixed by `cr2-engine`: `update` takes `{ expected, next }` and filters on `updated_at = expected`.                                                                                                                                                      |
| 8.4 | `server/.../pg-task-repository.ts:97`                         | VALID   | `update` checks `assertOwned('Thread', ...)` in the same transaction.                                                                                                                                                                                           |
| 8.5 | `server/.../search-query.ts:13` (combining marks)             | VALID   | `NON_WORD` is gone, so terms keep `\p{M}`. `किताब` matches.                                                                                                                                                                                                     |
| 8.6 | `server/.../search-query.ts:19` (`ʼ` -> `'`)                  | VALID   | `toSearchTerms` returns plain terms. `prefixTsQuery` runs `relay_search_text` on each term in SQL, then quotes it as a tsquery lexeme (`'` doubled, `\` escaped) and adds `:*`. `ʼ` no longer fails with a syntax error, and `oʼneil` finds `O'Neil`.           |
| 8.7 | `server/test/.../credential-vault-compare-and-set.test.ts:82` | VALID   | A `ReadBarrierStore` (subclass of the real store) holds both reads until both have read. The test now fails when the SQL envelope guard is removed (checked).                                                                                                   |
| 8.8 | `server/test/.../refresh-tokens.test.ts:133`                  | VALID   | `openLockHolder` rolls back through `onTestFinished` when the test did not finish it. Test-only.                                                                                                                                                                |
| 8.9 | `deploy/README.md:40` (`REGISTRATION_ENABLED`)                | SKIP    | False positive. `RegistrationService` rejects with 403 (`auth.e2e.test.ts` covers it), and compose passes `.env` through `env_file`.                                                                                                                            |

## Requests

- **A (security).** `AiMailToolsResolver` is `(job, owner)`. `AiRequestBuilder.build(job, owner, runner, signal)`. New port `AiJobRepository.isHeldBy(userId, jobId, owner, now)`: the job is `running`, `claimed_by = owner`, and the lease is null or `>= now`. Implemented in Postgres, SQLite and the memory repo. `AiService.ownsJob(userId, jobId, owner)`. In the token, `MailToolsHolder` is now `{ kind: 'device', deviceId, leaseId } | { kind: 'run', owner }`. A run token carries `own`. A token with neither `own` nor `dev`+`lease` (the old holder-less format) is rejected. `MailToolsGrantAuthorizer` calls `ownsJob` for run tokens. Device tokens keep the heartbeat check. E2E `mail-mcp.e2e.test.ts`: a run token works, is rejected after the lease ends, and stays rejected after another worker reclaims the job. That worker's token works. Desktop is unchanged (it passes a static endpoint).
- **B.** `deploy/README.md` and both `.env.example` files document `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_SECONDS`. While checking this I found that `trustProxy: true` takes the **leftmost** `X-Forwarded-For` entry. Cloudflare appends to a header the client sends, so the per-IP limit could be spoofed even behind the tunnel. New `TRUST_PROXY_HOPS` (default `1`, `0` = ignore the header) is a Fastify trust function `hop < n`. With `1`, the client IP is the rightmost entry. The README explains this and the direct-exposure case. E2E: spoofed leftmost entries share one bucket.

## Needed outside my area

- Finding 8.2 (engine owner): in `AccountRegistration.register`, remember the previous primary account (`existing.find((account) => account.isPrimary)`). If `vault.set` fails and the new account was primary, restore it after the delete (`accounts.setPrimary(userId, previous.id)`). An alternative is to run create and vault write in one unit of work, but `CredentialVault` is not bound to a unit of work.

## Checks

- `pnpm format:check`: fails only on 3 untracked desktop test files of another agent.
- `pnpm lint`: fails only in `@relay/desktop` (4 errors in another agent's uncommitted files). Everything else passes.
- `pnpm typecheck`: fails only in `@relay/desktop` (`src/main/index.ts:81`, `test/main/native-features.test.ts`, both uncommitted desktop work).
- `pnpm test --continue`: every package passes except `@relay/desktop` (4 failures in `thread-ai`, `session-transitions`, `settings`, all in files another agent is changing). Server 57 files / 217 tests, engine 168, store-sqlite 111. The mcp-mail unhandled rejection is gone (`5074581`).

## Review

A read-only `codex exec -m gpt-6.1-sol` pass over `0457b82 15b0f7d 9043964 5a9f42a` reported no significant correctness or security findings. It confirmed the proxy hop semantics: `1` takes the rightmost `X-Forwarded-For` entry and `0` takes the socket address.
