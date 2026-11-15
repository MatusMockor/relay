# cr-leftovers

Last CodeRabbit findings: `cr3/pr11-extra.md` (8), `cr3/pr12-tests.md` (4) and engine finding 8.2 from `cr-pr7-8.md`.

## Findings

| #   | Where                                                     | Verdict | What / why                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `renderer/test/support/contract-server.ts:156`            | SKIP    | Already fixed: `upgraded` sockets are tracked and destroyed before `server.close()`.                                                                                                                                                                                                                                      |
| 2   | `ui/.../Popover.tsx:50`                                   | VALID   | Placement moved to a pure `placement()` function. The layout effect runs it again from a `ResizeObserver` (skipped where none exists). Test: content grows to 300px and the popover flips above the anchor.                                                                                                               |
| 3   | `ui/.../ResizeHandle.tsx:75`                              | VALID   | An unmount effect removes `rz-drag` only when this handle owns an active drag. Test: pointer down, unmount, class gone.                                                                                                                                                                                                   |
| 4   | `ui/.../Segmented.tsx:25`                                 | VALID   | Roving tab index (one tab stop). Arrow keys in both axes plus Home/End move and select, wrapping. Shared helper `roving-focus.ts`.                                                                                                                                                                                        |
| 5   | `ui/.../Tabs.tsx:35`                                      | VALID   | Roving tab index. Left/Right wrap, Home/End. Automatic activation (panels switch instantly). Keys from the `trailing` slot are ignored. Up/Down stay free.                                                                                                                                                                |
| 6   | `ui/.../use-layer.ts:6`                                   | VALID   | The handler ref is written in a layout effect, not during render. No failing test: the bug needs a suspended render, which the suite cannot produce reliably.                                                                                                                                                             |
| 7   | `ui/.../use-layer.ts:9`                                   | VALID   | Each layer gets a `LayerNode { parent }` from `LayerContext`, which `Overlay` provides to its children. Dispatch takes the last pushed layer and then walks down to its newest descendant, so a child mounted in the same commit as its parent wins. A later sibling overlay still wins over an older nested popover.     |
| 8   | `ui/styles/base.css:44`                                   | SKIP    | The rule is copied from `design/prototype/app-a.html:44`. Inputs and textareas show focus through the caret, and `.fld`/`.chat-in` add border styles. Removing the rule would draw accent rings around the compose and reply editors, which breaks visual parity.                                                         |
| 9   | `desktop/test/integration/google-sign-in.test.tsx:89`     | SKIP    | Renderer integration tests use the schema-checked contract server by design. Running the real Nest server would make desktop tests depend on `apps/server` (SWC decorators, Postgres). Server e2e (`accounts.e2e`, `google-token-stub`) covers the OAuth grant. See request A.                                            |
| 10  | `desktop/test/main/background-lifecycle-races.test.ts:73` | VALID   | The watcher double is gone. `idle-supervisor-release.e2e.test.ts` drives `IdleSupervisor` with the real `sync.watchAccount` against GreenMail through `support/gated-tcp-proxy.ts`, which holds the TCP connect open. It checks that a late connection is closed after release, and covers the normal watch/release path. |
| 11  | `desktop/test/main/remote-ai-session.test.ts:31`          | SKIP    | Same reason as 9. Server rotation, reuse and revocation are covered by `server/test/persistence/refresh-tokens.test.ts` and `auth.e2e.test.ts`. See request A.                                                                                                                                                            |
| 12  | `desktop/test/main/support/stub-relay-server.ts:148`      | SKIP    | Same reason as 9 and 11. See request A.                                                                                                                                                                                                                                                                                   |
| 13  | engine 8.2 `AccountRegistration.register`                 | VALID   | `rollback()` deletes the new account and calls `setPrimary` on the previous primary when the new account was primary. The memory repo's `create` now clears other primaries like Postgres and SQLite do. `MemoryCredentialVault.failSet` injects the vault failure. Test fails without the fix (checked).                 |

UI tests 2, 3, 4, 5 and 7 fail against the old components (checked). The finding 10 test also passes with the old `slot.cancelled` guard removed, because `release` awaits the pending attempt and then calls its stop. It is a regression test of the real connection cleanup, not of that guard alone.

## Commits

- `b0b8a1a` fix(engine): restore the previous primary account when storing new credentials fails
- `b595345` feat(ui): arrow key navigation with a roving tab index in Tabs and Segmented
- `a2188e9` fix(ui): child-first layer order, committed layer handlers, popover re-placement and drag cleanup
- `f380a05` test(desktop): cover the IDLE release race with the real watcher against GreenMail
- `7a05369` fix(engine): keep a newer primary account when rolling back a failed registration
- `4823d35` fix(ui): move roving focus from the focused item, not the selected one

## Requests

- **A (orchestrator / user decision).** Findings 9, 11 and 12 ask for desktop tests against the real Relay server. That is a test-strategy change, not a leftover fix. It would need a desktop -> server test dependency (or a shared test harness package that boots the Nest app with SWC), Postgres per test file, and a choice about which desktop suites keep the contract server. Suggest a separate task: a small cross-app contract suite (desktop `ServerSessions` + Google sign-in against the real server) next to the existing stubs.

## Checks

- `@relay/ui`: lint, typecheck, test (14) pass.
- `@relay/engine`: lint, typecheck, test (170) pass.
- `@relay/desktop`: lint, typecheck, test (67 files / 278 tests) pass, including cr-pr12's committed feature work.
- `pnpm format:check`: passes.

## Review

A read-only `codex exec -m gpt-6.1-sol` pass over `b0b8a1a b595345 a2188e9 f380a05` found two P2 issues. Both are fixed:

- Segmented and Tabs moved from the selected item. When the selection updates asynchronously (account sync interval saved through the API), pressing Right twice sent the same value twice. They now move from the focused item (`4823d35`). The test fails without the fix.
- The rollback restored a stale primary. If another request made account C primary while B's vault write was pending, the rollback reset the primary to A. Now it restores A only when no account is primary after the delete and A still exists (`7a05369`). The test makes C primary from `MemoryCredentialVault.beforeSet` and fails without the fix. A narrow window between the check and `setPrimary` remains, because the repository port has no conditional primary write.
