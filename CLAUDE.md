# Relay - instructions for coding agents

Read `docs/ARCHITECTURE.md` before changing anything. It is the source of truth for modes, package boundaries and the domain model.

## Stack

- pnpm workspaces + Turborepo, TypeScript strict (ESM), Node >= 22.
- `apps/server`: NestJS 11 (Fastify), Drizzle ORM + Postgres, pg-boss, WebSocket gateway.
- `apps/desktop`: Electron + electron-vite + React 19 + TanStack Query + Zustand.
- `packages/*`: see the architecture doc. Package scope is `@relay/*`.

## Architecture rules

- SOLID throughout. Depend on abstractions: application services in `@relay/engine` use ports (interfaces) and never import infrastructure.
- All persistence goes through repository classes that implement engine repository ports. No Drizzle/SQL in services, controllers, IPC handlers or React code.
- Use design patterns where they fit (Repository, Adapter, Strategy, Factory, Command, Observer, Pipeline). Do not force them.
- One responsibility per file. Keep files small (aim for < 150 lines, hard limit 300). Split by use case, not by technical layer dumps.
- Guard clauses and early returns. Never use `else` / `else if`.
- No code comments. Exception: annotations required by tooling.
- No `any`. Validate every external input (HTTP, IPC, IMAP data, CLI output, env) with zod schemas from `@relay/shared`.
- Packages never import from apps. `engine` imports only `shared`.
- Composition roots: Nest modules on the server, `apps/desktop/src/main/composition` in the desktop main process. Wire implementations to ports there.

## Testing

- Vitest everywhere. Prefer integration tests through real collaborators.
- Real infrastructure in tests: Postgres and GreenMail (IMAP/SMTP) from `docker-compose.test.yml`, real SQLite files or `:memory:`.
- Mock or stub only true third-party boundaries (Google OAuth endpoints, the Claude/Codex CLIs via a stub executable). Never mock our own repositories or services.
- Never `throw` in test code. Use assertions (`expect(...)`).
- Never make real network requests to third parties in tests.

## Verifying work

- Run `pnpm lint`, `pnpm typecheck` and `pnpm test` (or the filtered package variants). Do NOT run production builds just to verify compilation.
- Prettier formats everything. `pnpm format` before committing.

## Git

- Branch names: `<type>/<short-slug>` with type in feat, fix, refactor, chore, docs, test, perf.
- Conventional commit messages. No AI attribution, no `Co-Authored-By` lines, no "Generated with" footers in commits or PRs.

## UI copy

Slovak with proper diacritics. Never use the em dash or en dash characters, use a normal hyphen.
