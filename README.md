# Relay

AI-native mail client: an Electron desktop app for macOS and Linux plus an optional, self-hostable NestJS sync server. AI features (one-line summaries, thread summaries, reply suggestions, chat over mail, Jira triage) run either on the server or locally through the user's own Claude Code / Codex CLI.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for modes, package boundaries and the domain model, and [`CLAUDE.md`](CLAUDE.md) for the engineering rules.

## Prerequisites

- Node.js >= 22 (`.nvmrc` pins 24 for development and CI)
- pnpm 10 (`corepack enable`, the exact version is pinned in `packageManager`)
- Docker with Compose v2 (Postgres and GreenMail for tests)
- A C/C++ toolchain and Python 3 if `better-sqlite3` has to be compiled for your Node or Electron version

## Setup

```sh
pnpm install
pnpm test:infra:up   # Postgres 17 on 5433 + GreenMail (IMAP 3143, SMTP 3025)
pnpm lint && pnpm typecheck && pnpm test
```

Run the apps:

```sh
pnpm db:up                                # dev Postgres 17 on 5432 (persistent volume)
pnpm --filter @relay/server dev           # API on http://localhost:3000 (GET /health)
pnpm --filter @relay/desktop dev:web      # renderer only, http://127.0.0.1:5173, no Electron IPC
pnpm --filter @relay/desktop dev          # full Electron app (needs a display)
```

`better-sqlite3` is a native module and node_modules holds one build at a time. Before `pnpm --filter @relay/desktop dev` run `pnpm --filter @relay/desktop native:electron`, and `pnpm --filter @relay/desktop native:node` to switch back for Vitest.

Environment variables are documented in `.env.example` (test infrastructure overrides) and `apps/server/.env.example` (server).

## Scripts

| Script                                        | What it does                                               |
| --------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                    | `dev` in every package that has one (Turborepo)            |
| `pnpm lint` / `pnpm lint:fix`                 | ESLint (typescript-eslint strict-type-checked) per package |
| `pnpm typecheck`                              | `tsc --noEmit` per package                                 |
| `pnpm test`                                   | Vitest per package (needs `pnpm test:infra:up`)            |
| `pnpm format` / `pnpm format:check`           | Prettier over the whole repo                               |
| `pnpm db:up` / `pnpm db:down`                 | Dev Postgres (`docker-compose.yml`)                        |
| `pnpm test:infra:up` / `pnpm test:infra:down` | Test Postgres + GreenMail (`docker-compose.test.yml`)      |

Filter to one package with `pnpm --filter @relay/<name> <script>`. There is no build step for development: internal packages are consumed as TypeScript source (`exports` point at `src`), and Vite (Vitest, electron-vite, vite-node) resolves them directly.

## Test infrastructure

`docker-compose.test.yml` starts throwaway services (tmpfs, no volumes):

- Postgres 17: `postgres://relay:relay@127.0.0.1:5433/relay_test`
- GreenMail 2.1: IMAP `3143`, IMAPS `3993`, SMTP `3025`, SMTPS `3465`, REST API `http://127.0.0.1:8086`
- Test user: `relay@relay.test` / `relay-secret` (login with the full address). More users can be created through the GreenMail API.

Tests read these values through `@relay/config/test-infra` (`testInfra`), which honours the variables in `.env.example`.

## Package map

| Package               | Purpose                                                                                         | May import           |
| --------------------- | ----------------------------------------------------------------------------------------------- | -------------------- |
| `@relay/shared`       | zod contracts: domain, REST API (`/api`), WebSocket events (`/realtime`), Electron IPC (`/ipc`) | `zod` only           |
| `@relay/engine`       | Ports (interfaces), port tokens, engine errors, application services                            | `@relay/shared` only |
| `@relay/store-sqlite` | SQLite (better-sqlite3 + Drizzle) repositories for local mode                                   | packages, never apps |
| `@relay/mail-core`    | IMAP / Gmail providers, SMTP sender, MIME parsing, threading, Jira classifier                   | packages, never apps |
| `@relay/ai`           | Claude Code / Codex CLI runners, CLI detection, prompts                                         | packages, never apps |
| `@relay/mcp-mail`     | MCP server with mail tools backed by engine ports                                               | packages, never apps |
| `@relay/ui`           | Design tokens and React components                                                              | packages, never apps |
| `@relay/config`       | tsconfig bases, ESLint preset (incl. import boundaries), Vitest preset, test infra settings     | -                    |
| `@relay/server`       | NestJS 11 + Fastify API, workers, WebSocket gateway                                             | anything             |
| `@relay/desktop`      | Electron main / preload / React renderer                                                        | anything             |

The import rules are enforced by ESLint (`no-restricted-imports` patterns in `packages/config/eslint/boundaries.js`).
