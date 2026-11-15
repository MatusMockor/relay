import { z } from 'zod';
import { CredentialsKeySchema } from '../credentials/credentials-key';

export interface PersistenceConfig {
  readonly databaseUrl: string;
  readonly credentialsKey: Buffer;
  readonly migrateOnStart: boolean;
  readonly maxConnections: number;
  readonly migrationsFolder?: string;
}

const BooleanFlagSchema = z.union([z.boolean(), z.stringbool()]);

export const PersistenceEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  CREDENTIALS_ENCRYPTION_KEY: CredentialsKeySchema,
  DATABASE_MIGRATE_ON_START: BooleanFlagSchema.default(true),
  DATABASE_POOL_MAX: z.coerce.number<number | string>().int().positive().default(10),
});

export const PERSISTENCE_ENV_KEYS = Object.keys(PersistenceEnvSchema.shape) as readonly (
  | 'DATABASE_URL'
  | 'CREDENTIALS_ENCRYPTION_KEY'
  | 'DATABASE_MIGRATE_ON_START'
  | 'DATABASE_POOL_MAX'
)[];

export const parsePersistenceConfig = (
  raw: Readonly<Record<string, unknown>>,
): PersistenceConfig => {
  const result = PersistenceEnvSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid persistence configuration: ${details}`);
  }
  return {
    databaseUrl: result.data.DATABASE_URL,
    credentialsKey: result.data.CREDENTIALS_ENCRYPTION_KEY,
    migrateOnStart: result.data.DATABASE_MIGRATE_ON_START,
    maxConnections: result.data.DATABASE_POOL_MAX,
  };
};
