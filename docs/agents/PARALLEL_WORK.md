# Parallel work rules (MVP core sprint)

Several agents work at the same time in the SAME checkout (`/home/codex/Developer/relay`) on the SAME branch `feat/mvp-core`. Follow these rules exactly so nobody breaks anybody else.

## Ownership

- You own only the paths listed in your task. Never edit, format, move or delete files outside them.
- If you need a change in a path you don't own (for example a new field in `@relay/shared` or a new port in `@relay/engine`), don't make it yourself. Write the request into your coordination note (below) with the exact proposed change, and work around it in the meantime (local type, adapter). The orchestrator applies shared contract changes.
- `@relay/shared` and `packages/engine/src/ports` are frozen during the sprint, except by the engine agent for `packages/engine/src/ports` additions that other agents explicitly request in their notes.

## Git

- Do not create or switch branches. Stay on `feat/mvp-core`.
- Commit only your own paths with a pathspec commit: `git commit -m "<type>(<scope>): ..." -- <your paths>` (this ignores whatever other agents have staged in the shared index). Run `git add <new files in your paths>` first for untracked files. Never `git add -A` / `git add .`, never `git commit -a`, never `git stash`, never `git reset`, never `git checkout -- <file>` on paths you don't own.
- If git reports `index.lock` exists, wait a few seconds and retry. Never delete the lock while another process may be running.
- Do not push and do not open PRs. The orchestrator splits the branch into reviewable PRs.
- Commit often (at least every meaningful step). Runs have been killed by restarts before.

## Dependencies

- All expected dependencies are already installed. Only add a new dependency if it is truly required. Use `pnpm --filter <your package> add <dep>@<exact version>`, retry if the lockfile is busy, and mention it in your note.
- `better-sqlite3` is currently built for Node (tests). Do NOT run `native:electron` / electron-rebuild; the orchestrator switches builds when launching Electron.

## Test infrastructure (shared, already running)

- Postgres test DB: `postgres://relay:relay@127.0.0.1:5433/relay_test`. Each test file must create its own database (e.g. `relay_test_<random>`) or schema and drop it at the end. Never truncate shared tables other tests may use.
- GreenMail: IMAP `127.0.0.1:3143` (plain) / `3993` (TLS), SMTP `3025` / `3465`, REST API `http://127.0.0.1:8086`. Create a unique user per test (`POST /api/user` with `{"email","login","password"}`) and never call global purge/reset endpoints.
- Never run `pnpm test:infra:down` or restart the containers.

## Quality bar

- Follow `CLAUDE.md` strictly. In short: SOLID, repositories for all persistence, small files, no `else`, no comments, no `any`, zod at boundaries, integration tests with real collaborators, and no mocks of our own code.
- Before every commit, run `pnpm --filter <your package> lint`, `typecheck` and `test` on your package(s), plus `pnpm exec prettier --write <your paths>`. Do not run production builds.

## Coordination notes (how agents talk to each other)

- Each agent keeps one note: `docs/agents/notes/<your-agent-id>.md`. Update it after every milestone with:
  - status;
  - what is ready for others to use (exact exports/classes);
  - requests to other agents;
  - decisions others must know.
- Read the other agents' notes before starting and whenever you depend on them (for example the server agent checks whether engine services are ready before wiring a controller).
- If something you depend on isn't ready yet, build the parts that don't depend on it first, then come back.

## Finish

When your scope is done and green, update your note with a final summary, commit it, and end with a final message listing:

- what you built (exports, classes, endpoints, screens);
- test commands and results;
- known gaps;
- requests to others or the orchestrator.
