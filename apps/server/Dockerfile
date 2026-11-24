# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.11.1

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    COREPACK_HOME=/opt/corepack
RUN corepack enable
WORKDIR /app

FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/mail-core/package.json packages/mail-core/
COPY packages/ai/package.json packages/ai/
COPY packages/mcp-mail/package.json packages/mcp-mail/
COPY packages/task-systems/package.json packages/task-systems/
COPY apps/server/package.json apps/server/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@relay/server..."

FROM base AS runtime
ARG INSTALL_AI_CLIS=false
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
RUN if [ "$INSTALL_AI_CLIS" = "true" ]; then \
      npm install -g @anthropic-ai/claude-code @openai/codex && npm cache clean --force; \
    fi
COPY --from=deps --chown=node:node /app /app
COPY --from=deps --chown=node:node /opt/corepack /opt/corepack
COPY --chown=node:node packages/config packages/config
COPY --chown=node:node packages/shared packages/shared
COPY --chown=node:node packages/engine packages/engine
COPY --chown=node:node packages/mail-core packages/mail-core
COPY --chown=node:node packages/ai packages/ai
COPY --chown=node:node packages/mcp-mail packages/mcp-mail
COPY --chown=node:node packages/task-systems packages/task-systems
COPY --chown=node:node apps/server apps/server
USER node
WORKDIR /app/apps/server
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
