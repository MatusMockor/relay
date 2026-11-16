import { randomBytes } from 'node:crypto';

export type ServerEnvOverrides = Readonly<Record<string, string>>;

export interface ServerEnvInput {
  readonly port: number;
  readonly databaseUrl: string;
  readonly aiCliDir: string;
  readonly overrides: ServerEnvOverrides;
}

const secret = (): string => randomBytes(32).toString('base64url');

export const serverEnv = (input: ServerEnvInput): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NO_COLOR: '1',
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: String(input.port),
  PUBLIC_URL: `http://127.0.0.1:${String(input.port)}`,
  DATABASE_URL: input.databaseUrl,
  DATABASE_POOL_MAX: '4',
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  MAIL_ALLOW_PLAINTEXT: 'true',
  AUTH_RATE_LIMIT_MAX: '100000',
  JOBS_ENABLED: 'true',
  IMAP_IDLE_ENABLED: 'false',
  JOBS_TICK_MS: '200',
  JOBS_POLL_INTERVAL_SECONDS: '0.5',
  AI_CLI_PATH: input.aiCliDir,
  ...input.overrides,
});
