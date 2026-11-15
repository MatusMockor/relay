STATUS: DONE

# cr-pr10 (agent `cr-pr10`)

CodeRabbit findings on the Electron main-process PR (`apps/desktop/src/main/**`, preload, `test/main/**`, desktop configs, `packages/shared/src/ipc/**`). All 25 were checked against the current code. Every fix has a test that fails without it (checked by putting the HEAD version of the source file back), unless noted.

Commits: `c171e77` (storage, secrets, session), `923818f` (background, OAuth, shutdown), `8e8d755` (native shell, logging, packaging), plus the review follow-up (see below).

## Findings

| #   | Where                                          | Verdict | What changed                                                                                                                                                                                                 |
| --- | ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `electron-builder.yml:64`                      | VALID   | `deb.depends` removed. Checked in app-builder-lib 26.0.12: `depends` replaces `getDefaultDepends`, and that list already has `libsecret-1-0` and `libnotify4`. A config test guards it.                      |
| 2   | `ai/local-mail-tools-server.ts:21`             | VALID   | The limit is measured in UTF-8 bytes. The tmpdir fallback is checked too and falls back to `/tmp` (not on Windows).                                                                                          |
| 3   | `ai/remote/server-session-key.ts:4`            | VALID   | `session-channels.ts` `ServerUrlSchema` rejects `?` and `#`, as the domain schema already does.                                                                                                              |
| 4   | `ai/remote/server-session.ts:52`               | VALID   | Concurrent `access()` / `renew()` callers with the same rejected token (or none) share one in-flight refresh and its outcome, including `unavailable`.                                                       |
| 5   | `background/account-sync-scheduler.ts:42`      | VALID   | Bounded in the quit path (see 12): the teardown races a 10 s deadline, then `app.exit(0)`.                                                                                                                   |
| 6   | `background/account-sync-scheduler.ts:66`      | VALID   | Runners removed by reconcile go to a `draining` set until their sync ends. `idle()` and `stop()` wait for it.                                                                                                |
| 7   | `background/account-sync-scheduler.ts:104`     | VALID   | One-shot `syncNow(accountId)` runners are tracked in the same `draining` set.                                                                                                                                |
| 8   | `background/idle-supervisor.ts:40`             | VALID   | New watches iterate the deduped `wanted` set.                                                                                                                                                                |
| 9   | `background/mode-aware-background.ts:20`       | VALID   | Fixed in `DeviceSettingsStore`: one shared in-flight load, the loaded value is only cached when the cache is still empty. The store now accepts a `JsonDocument` (or a path) so the race can be tested.      |
| 10  | `background/periodic-runner.ts:57`             | VALID   | The task starts in a promise continuation, so a synchronous throw no longer leaves `current` stuck.                                                                                                          |
| 11  | `bootstrap/main-window-controller.ts:13`       | VALID   | A rejected creation clears `opening` and keeps the rejection for current callers. The controller depends on a small `ManagedWindow` interface. Tray, activate and second-instance callers log the rejection. |
| 12  | `index.ts:112` (register before startup)       | VALID   | New `bootstrap/quit-guard.ts`. `will-quit` is registered right after the single-instance lock. Teardown waits for startup, then stops the services.                                                          |
| 13  | `index.ts:114` (repeated quit)                 | VALID   | The guard calls `preventDefault()` on every `will-quit` and runs the teardown once.                                                                                                                          |
| 14  | `infra/file-log-sink.ts:29`                    | VALID   | bigint is written as a string, cycles retry as `[Circular]`, and anything else falls back to `{ unserializable: true }`.                                                                                     |
| 15  | `native/app-menu-template.ts:78`               | VALID   | macOS gets a `Súbor` menu with `close` (`Zavrieť okno`).                                                                                                                                                     |
| 16  | `native/electron-notification-presenter.ts:11` | VALID   | Became `SystemNotificationPresenter` plus an `electronNotifications` adapter. Notifications are retained until clicked, closed or failed, and `dispose()` (shell dispose) closes the rest.                   |
| 17  | `native/new-mail-notifier.ts:61`               | VALID   | Both async entry points log failures (`logger` dep added). The notification is discarded, not retried.                                                                                                       |
| 18  | `native/new-mail-notifier.ts:76`               | VALID   | A generation token is checked after each await. `stop()` bumps it and clears the pending digest.                                                                                                             |
| 19  | `native/track-window-state.ts:24`              | VALID   | A failed save is logged. `trackWindowState` takes a small `TrackedWindow` interface and the logger.                                                                                                          |
| 20  | `native/unread-badge-updater.ts:55`            | VALID   | Refreshes are serialized with a rerun flag.                                                                                                                                                                  |
| 21  | `native/window-bounds.ts:28`                   | VALID   | `y` is clamped to the top of the display with the largest visible area.                                                                                                                                      |
| 22  | `oauth/google-oauth-coordinator.ts:28`         | VALID   | Every unfinished authorization is tracked, and `shutdown()` waits for all of them.                                                                                                                           |
| 23  | `secure/encrypted-file-secret-store.ts:81`     | VALID   | One shared in-flight initialization, and the cache is only set when it is still empty.                                                                                                                       |
| 24  | `storage/atomic-file.ts:35`                    | VALID   | A failed write or rename removes the temporary file and rethrows the original error.                                                                                                                         |
| 25  | `storage/file-attachment-store.ts:43`          | VALID   | A failed content or metadata write removes both files of the new id and rethrows.                                                                                                                            |

New tests in `test/main`: `quit-guard`, `main-window-controller`, `system-notification-presenter`, `track-window-state`, `file-log-sink`, `file-storage-cleanup`, `mail-tools-socket-path`, plus new cases in `remote-ai-session`, `background-lifecycle-races`, `background-scheduler`, `idle-supervisor`, `device-settings-store`, `secret-store`, `google-oauth`, `native-features` and `app-identity`. Finding 12 (quit guard) is tested as a unit. The wiring in `index.ts` is Electron glue and was not run, because Electron must not be launched here.

## gpt-6.1-sol review (read-only, `b04f396..8e8d755`)

1. Medium, `server-session.ts`: a `renew` that arrives after a queued `clear()` / `save()` joined the refresh started before it and got the old account's token. VALID: `save` and `clear` drop the shared attempts, and cleanup only removes the attempt it owns. Test: "does not hand a caller that arrived after a logout the refresh started before it".
2. Low, `unread-badge-updater.ts`: a refresh in the microtask gap before `.finally` cleared `running` set `rerun` without a recount. VALID: `running` is cleared in the same continuation as the last rerun check. Test in `unread-badge-ordering.test.ts`.

Both tests fail without the follow-up fix.

## Requests

- None for other agents.

## Notes for other agents

- `pnpm --filter @relay/desktop lint` and `typecheck` pass. `test`: all `test/main` tests pass. Renderer failures (cr-pr11's area, not touched): `src/renderer/test/compose-flows.test.tsx` (2 tests) fails. `src/renderer/test/settings.test.tsx` failed in the first run and also failed with my shared change reverted, then passed in the last run. Neither imports main-process code.
- `pnpm format:check` fails only on `apps/desktop/src/renderer/src/features/thread/automated.ts` (cr-pr11).
- Mistake on my side: one early `prettier --write` run included cr-pr11's modified renderer and `packages/ui` files, because I built the file list from `git status` over all of `apps/desktop`. Prettier only reformats, nothing else was changed, and none of those files were committed by me.
