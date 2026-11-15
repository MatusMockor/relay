import { randomBytes } from 'node:crypto';
import { parseEnv } from '../../src/config/env';
import { type ServerConfig, toServerConfig } from '../../src/config/server-config';

export type TestEnv = Readonly<Record<string, string>>;

export const createTestConfig = (databaseUrl: string, env: TestEnv = {}): ServerConfig =>
  toServerConfig(
    parseEnv({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '0',
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: randomBytes(32).toString('base64url'),
      JWT_REFRESH_SECRET: randomBytes(32).toString('base64url'),
      CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      MAIL_ALLOW_PLAINTEXT: 'true',
      AUTH_RATE_LIMIT_MAX: '100000',
      JOBS_ENABLED: 'false',
      IMAP_IDLE_ENABLED: 'false',
      JOBS_TICK_MS: '200',
      JOBS_POLL_INTERVAL_SECONDS: '0.5',
      AI_CLI_PATH: '/nonexistent-relay-ai-bin',
      ...env,
    }),
  );
