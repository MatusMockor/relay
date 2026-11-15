STATUS: DONE

# cr-pr6 (agent `cr-pr6`)

CodeRabbit findings on the AI runners PR (`packages/ai/**`, `packages/mcp-mail/**`). All 17 findings were VALID: 16 code fixes (the Codex tools fix leaves a residual risk, described below) and 1 test-only addition. Every code fix has a test that fails without it.

## Behavior changes

- `CliLocator.locate` returns absolute paths (`resolve(dir, name)`), so a relative PATH entry still works after the runner changes `cwd` to the run workspace.
- Codex `login status`: a nonzero exit without a recognised "not logged in" text is now `authenticated: 'unknown'` instead of `false`.
- `ExecaCliLauncher` reaps the CLI process group when the direct child exits (`'exit'` event, before stdio closes): SIGTERM to the group, then SIGKILL after 2 s (`src/process/process-group.ts`). A grandchild that holds stdout/stderr open and ignores SIGTERM no longer hangs a timed out or cancelled run.
- `runAttempt` awaits the CLI exit when the consumer stops early, so the workspace is removed only after the CLI has exited.
- Codex invocations add `-c features.<x>=false` for `shell_tool`, `unified_exec`, `view_image`, `image_generation`, `apps`, `plugins`, `browser_use`, `browser_use_external`, `multi_agent`, plus `-c web_search="disabled"` (`src/runners/codex/codex-tool-policy.ts`). I checked this against Codex CLI 0.169.0 with `codex debug prompt-input` (renders the tool list locally, no model call) and an empty `CODEX_HOME`. It removes `exec_command`, `write_stdin` and `view_image`. Unknown feature keys are ignored and `web_search` is a validated key, so older and newer CLIs keep working.
- Repair prompt: `COMMON_TEXTS.repair` is now a fixed string. The validation error goes into its own untrusted block before the wrapped previous answer, so crafted key names from `Unrecognized key` never reach trusted prompt text.
- The rewrite response schema has no 20 000 character cap (the input schema has none).
- `htmlToText` in both packages is linear: hidden blocks (`script`, `style`, `head`) and tags are stripped with forward scans instead of backtracking regexes. Entities are decoded after tag removal, covering decimal, hex and `nbsp amp lt gt quot apos`. Invalid code points become U+FFFD. Output is the same as before for well-formed HTML. `<header>` is no longer treated as `<head>`.
- The thread renderer (ai) and `get_thread` views (mcp-mail) use the first non-blank of text body, converted HTML body, snippet.
- `JsonLineChannel` replaces `readline` with a bounded `LineFramer`. A frame over the limit destroys the socket. Defaults: host 4 MiB (`MailToolSocketHostOptions.maxFrameBytes`), bridge client 64 MiB (`SocketBackendOptions.maxFrameBytes`).
- `MailToolSocketHost.listen()`:
  - Rejects a second call.
  - Refuses to replace a path that is not a socket, or a socket that accepts connections.
  - Removes only a stale socket (ECONNREFUSED).
  - Closes the bound server and removes the path when the permission step fails. The permission step is an injectable `restrictAccess` option, default `chmod 0600`.
  - Desktop impact: a second Relay instance on the same `mail-tools.sock` now fails to listen instead of taking over the endpoint.
- `@relay/mcp-mail` no longer declares `bin`. The desktop app bundles `@relay/mcp-mail/cli`, and nothing used the bin. A stale `.bin/relay-mail-mcp` link in dependents disappears on the next `pnpm install` (not run here, to avoid disturbing other agents).

## Residual risk (not fixed, would need a larger change)

- Codex still lists `apply_patch` (blocked by `--sandbox read-only` plus `approval_policy="never"`), MCP resource tools (only the mail server is configured because of `--ignore-user-config`), and the `collaboration.*` sub-agent tools, which no feature flag I found removes. I could not verify whether spawned sub-agents inherit the disabled features without running a model. A full fix would run Codex with a custom sandbox or permission profile that denies reads outside the workspace. That is a design change, so I left it out of scope.
- `htmlToText` and `html-entities.ts` are duplicated in `packages/ai/src/prompts` and `packages/mcp-mail/src/presenters`. Moving them to `@relay/shared` would remove the copy, but I don't own that package.

## Requests

- None for engine, mail-core, store-sqlite or server. mail-core uses the `html-to-text` library, which has no quadratic regex issue.
- `pnpm format:check` currently fails only on `docs/agents/notes/cr2-engine.md` (owned by `cr2-engine`).
