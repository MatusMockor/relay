import { z } from 'zod';
import { PostgresUrlSchema } from '../persistence/config/persistence-config';

const SecretSchema = z.string().min(32, 'must be at least 32 characters');

const EncryptionKeySchema = z
  .string()
  .refine(
    (value) => Buffer.from(value, 'base64').length === 32,
    'must be 32 bytes encoded as base64',
  );

const PositiveIntSchema = (fallback: number) =>
  z.coerce.number<number | string>().int().positive().default(fallback);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number<number | string>().int().min(0).max(65_535).default(3000),
  PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
  DATABASE_URL: PostgresUrlSchema,
  DATABASE_MIGRATE_ON_START: z.stringbool().default(true),
  DATABASE_POOL_MAX: PositiveIntSchema(10),
  JWT_ACCESS_SECRET: SecretSchema,
  JWT_REFRESH_SECRET: SecretSchema,
  ACCESS_TOKEN_TTL_SECONDS: PositiveIntSchema(900),
  REFRESH_TOKEN_TTL_SECONDS: PositiveIntSchema(30 * 24 * 3600),
  CREDENTIALS_ENCRYPTION_KEY: EncryptionKeySchema,
  REGISTRATION_ENABLED: z.stringbool().default(true),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  MAIL_ALLOW_PLAINTEXT: z.stringbool().default(false),
  JOBS_ENABLED: z.stringbool().default(true),
  JOBS_TICK_MS: PositiveIntSchema(15_000),
  IMAP_IDLE_ENABLED: z.stringbool().default(true),
  JOBS_POLL_INTERVAL_SECONDS: z.coerce.number<number | string>().min(0.5).max(60).default(2),
  GOOGLE_OAUTH_TOKEN_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  AI_CLI_PATH: z.string().min(1).optional(),
});
export type Env = z.infer<typeof EnvSchema>;

const withoutEmptyValues = (raw: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));

export const parseEnv = (raw: Readonly<Record<string, unknown>>): Env => {
  const result = EnvSchema.safeParse(withoutEmptyValues(raw));
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid server environment: ${details}`);
};
