# ai-mcp - coordination note

Owner of `packages/ai/**` and `packages/mcp-mail/**`.

## Status

Done. Both packages lint, typecheck and test green (`@relay/ai` 43 tests, `@relay/mcp-mail` 20 tests). No new dependencies.

## Ready for others

### `@relay/ai`

- `createCliRunnerRegistry({ location, language?, models?: { claude?, codex? }, detector?, env? })` returns a `DefaultAiRunnerRegistry` (implements engine `AiRunnerRegistry`) with a `ClaudeCodeRunner` and a `CodexRunner`. This is what the server (`location: 'server'`) and desktop main (`location: 'local'`) should bind to `PORT_TOKENS.AiRunnerRegistry`.
- `ClaudeCodeRunner` / `CodexRunner` (both `CliAiRunner`, implement engine `AiRunner`). Options: `CliRunnerOptions { location, language = 'sk', model = null, detector?, launcher?, workspaces?, nonce?, env? }`.
  - `run(request)` yields `started` -> `toolCall` / `delta`\* -> `completed` (validated `AiOutput`) or `failed { code, message }`. Before `started` it can yield `failed not_installed` / `failed cancelled`.
  - Failure codes: `not_installed`, `not_authenticated` (login error text from the CLI), `timeout` (`request.timeoutMs`, covers the repair retry too), `cancelled` (`request.signal`), `invalid_output` (still invalid JSON after one repair retry), `process_failed` (stderr / CLI error text in `message`).
  - Breaking out of the iterator or aborting kills the CLI process (SIGTERM, SIGKILL after 2 s). On macOS / Linux the CLI runs in its own process group, which gets SIGTERM after every run, so MCP children and shell descendants do not survive.
  - A final answer only counts when the CLI exits with code 0.
  - Each run gets a private temp dir (cwd + `mcp-config.json` with mode 0600), removed afterwards.
- `CliDetector` (`detect(runner)`, `detectAll()`, `locate(runner)`) returns `CliDetection { runner, installed, version, path, authenticated: true | false | 'unknown', detail }`. `toRunnerInfo(detection, location)` maps it to shared `AiRunnerInfo` (`'unknown'` -> `null`). `CliLocator` searches PATH plus `~/.local/bin`, `~/.claude/local`, `~/.npm-global/bin`, `~/.bun/bin`, `~/.volta/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin` (GUI apps on macOS start with a minimal PATH).
  - Auth probes: `claude auth status --json` (`loggedIn`), `codex login status` (text + exit code). Timeouts 5 s (version) / 10 s (auth).
- Prompts: `prepareTaskPrompt(input: AiJobInput, { language, nonce, thread })` -> `PreparedPrompt<AiOutput>` (`system`, `text`, `tools`, `parse(raw)`, `repair(raw, error)`). Specs: `oneLinerPrompt`, `summaryPrompt`, `replySuggestionsPrompt`, `rewritePrompt`, `chatAnswerPrompt`, `createTaskPrompt` (+ `preparePrompt(spec, input, context)`). `PromptLanguage = 'sk' | 'en'`.
- Output: `extractJson`, `parseResponse(raw, schema)`.

### `@relay/mcp-mail`

- `MailToolBackend` (user-scoped: `listFolder`, `getThread`, `listTasks`, `createTask`, `createDraft`).
- `engineMailToolBackend(services, userId)` builds it from `EngineServices` (`inbox.list`, `threads.getDetail` with `markRead: false`, `tasks.list`, `tasks.createFromAi`, `compose.createDraft`). `engineMailTools(services)` + `scopeMailTools(queries, commands, userId)` are the lower-level pieces.
- `createMailMcpServer(backend)` -> `McpServer` with `search_threads`, `list_folder`, `get_thread`, `list_tasks`, `create_task`, `create_draft` (never sends). Read tools are annotated `readOnlyHint`, every result that carries mail content has an untrusted `notice`, server `instructions` repeat it.
- `serveMailMcpOverStdio(backend, { stdin?, stdout? })`.
- `createMailMcpHttpHandler(resolveBackend)` -> `(req, res, parsedBody?) => Promise<void>`, stateless streamable HTTP (JSON responses). `resolveBackend(req)` returns `null` -> 401. `bearerToken(req)` helper.
- `MailToolSocketHost({ path, token, backend })` (`listen()`, `close()` also drops live connections), `SocketMailToolBackend.connect(path, token, { handshakeTimeoutMs = 5000, requestTimeoutMs = 30000 })`. Socket errors on either side close the connection instead of crashing the process.
- CLI entry `relay-mail-mcp` (`bin`, also export `@relay/mcp-mail/cli`): `relay-mail-mcp --socket <path>` with the token in env `RELAY_MAIL_MCP_TOKEN` (`MAIL_MCP_TOKEN_ENV`). `runRelayMailMcp({ argv, env, stdin?, stdout? })` is the testable core.

## How to wire it

### server-api (AI on the server)

1. Bind `createCliRunnerRegistry({ location: 'server' })` (already planned in `AiRuntimeModule`).
2. Mount the HTTP handler, e.g. `POST /mcp` (and GET/DELETE for completeness) with Fastify: `handler(request.raw, reply.raw, request.body)` and `reply.hijack()`. `resolveBackend` verifies a short-lived per-job token and returns `engineMailToolBackend(services, userId)`.
3. For each AI job pass `mailTools = { transport: 'http', command: null, args: [], url: '<server base>/mcp', headers: { Authorization: 'Bearer <per-job token>' } }`. The runners put the headers into the Claude MCP config file (0600). For Codex a `Bearer` token goes into env `RELAY_MAIL_MCP_BEARER_TOKEN` (`bearer_token_env_var`) and every other header into env `RELAY_MAIL_MCP_HEADER_<n>` (`env_http_headers`), so no secret appears in argv. The URL must be reachable from the server host itself (loopback is fine).

### desktop-main (AI locally)

1. Bind `createCliRunnerRegistry({ location: 'local' })`.
2. On startup create a random token and a socket path in `userData` (Unix socket; on Windows a `\\.\pipe\relay-mail-<random>` path) and start `new MailToolSocketHost({ path, token, backend: engineMailToolBackend(services, localUserId) })`. Close it on quit.
3. Bundle `@relay/mcp-mail/cli` as an extra main-process entry in electron-vite (for example `out/main/relay-mail-mcp.js`). It cannot run from TS source: Node 26 only strips types and does not resolve extensionless imports.
4. Pass `mailTools = { transport: 'stdio', command: process.execPath, args: ['<abs path>/relay-mail-mcp.js', '--socket', path], url: null, headers: {}, env: { ELECTRON_RUN_AS_NODE: '1', RELAY_MAIL_MCP_TOKEN: token } }`. `env` is not in the engine `AiMailToolsEndpoint` yet (see requests). The runners already read it (`MailToolsEndpointWithEnv`), so passing an object with `env` works today.

Why a socket and not `--db <sqlite>`: SQLite stays owned by the main process (no second writer, no WAL contention), the CLI child does not need `better-sqlite3` (whose build targets Electron's ABI), and `mcp-mail` keeps depending on `engine` only.

## Decisions

- Claude flags: `-p --output-format stream-json --verbose --include-partial-messages --input-format text --system-prompt <relay system> --tools "" --strict-mcp-config --permission-mode dontAsk --no-session-persistence --disable-slash-commands [--mcp-config <file> --allowedTools mcp__mail__...] [--model]`, prompt on stdin. `--tools ""` removes every built-in tool (Bash, Read, Edit, Web ...), so only the allowed mail MCP tools remain.
- Codex flags (checked against `codex exec --help` 0.169.0 and the config keys in the binary): `exec --json --sandbox read-only --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --color never --cd <tmp> -c approval_policy="never" -c shell_environment_policy.inherit="none" -c mcp_servers.mail.{command,args,env_vars|url,env_http_headers,bearer_token_env_var,enabled_tools}=... [--model] -`, prompt on stdin. `--ignore-user-config` keeps the user's other MCP servers out (auth still comes from `CODEX_HOME`).
- Tools per job: `oneLiner`, `summary`, `replySuggestions`, `createTask` get the read tools only. `chatAnswer` also gets `create_task` / `create_draft` (only on explicit user request, per the prompt). `rewrite` gets none. Repair retries get none.
- The model returns JSON only. `chatAnswer` responds `{ text, threadIds }`. Since shared `AiOutput.chatAnswer` has no references field, the text keeps inline `[thread:<id>]` markers the UI can turn into links.
- `oneLiner` / `summary` / ... use `request.thread` when it matches the job's `threadId`, otherwise the prompt asks the model to call `get_thread`.
- Email content (thread, draft for rewrite, previous assistant turns, invalid output in a repair) is wrapped in `<<<UNTRUSTED_<nonce>>>` ... `<<<END_UNTRUSTED_<nonce>>>`, the nonce is removed from the content, and the prompt tells the model never to follow instructions inside.
- `reply suggestions` and `rewrite` answer in the language of the source text, the others in the configured language (Slovak by default).

## Requests

- **engine / orchestrator** (`packages/engine/src/model/ai.ts`): add `readonly env: Readonly<Record<string, string>>` to `AiMailToolsEndpoint` (needed for `ELECTRON_RUN_AS_NODE` and the socket token in local mode). Then I drop `MailToolsEndpointWithEnv`.
- **orchestrator** (`@relay/shared` domain/ai): add `createTask` to `AiTaskKindSchema`, `AiJobInputSchema` (`{ kind: 'createTask', threadId, hint: string | null }`) and `AiOutputSchema` (`{ kind: 'createTask', title, aiWhat }`). The prompt spec `createTaskPrompt` is ready; once shared has the kind I add one `case` to `prepareTaskPrompt`.
- **orchestrator** (`@relay/shared` domain/ai, optional): add `references: ThreadId[]` to the `chatAnswer` output so the `threadIds` the model returns do not get lost. Until then the UI can parse `[thread:<id>]` in the text.
- **orchestrator / optional**: a per-request model setting (`AiRequest.model` or `AiSettings.models`). Today the model is fixed per runner via `createCliRunnerRegistry({ models })`.

## Known gaps

- Real CLIs were never run against a model (by design). Flags and event shapes come from `--help`, the installed binaries and recorded formats. One manual smoke run per CLI is still needed, especially for Codex MCP tool approval in `exec` mode (`approval_policy="never"`; if Codex declines MCP calls, add the per-server approval override).
- **Security, Codex (high):** in the read-only sandbox Codex can still run shell commands that READ the filesystem (`command_execution` shows up as `toolCall 'command'`). A prompt-injected mail could make it read local files (credentials, other data) and quote them in its answer. Codex 0.169 has no flag that disables its shell. Mitigations in place: empty temp cwd, `shell_environment_policy.inherit="none"` (no env secrets in shell commands), `--ignore-user-config`, untrusted delimiters. Claude has no such gap (`--tools ""`). Recommendation for the orchestrator: keep `claude` as the default runner and consider showing a warning for Codex on the server until Codex offers a way to disable the shell.
- `engineMailTools` has no own test (typed thin mapping over engine services). It is covered once desktop-main/server-api wire it end to end.
- `relay-mail-mcp` is tested in-process (stdio streams + real socket host). A spawned child-process test needs the bundled JS entry from desktop-main.

## Review

gpt-6.1-sol read-only review of both packages (CodeRabbit CLI is not installed on this machine). Fixed: socket handshake hanging on disconnect, missing handshake/request deadlines, missing socket `error` handlers, local MCP token and non-Bearer headers in Codex argv, leftover process trees, final answer accepted on nonzero exit. Not fixable today: Codex shell read access (see Known gaps).
