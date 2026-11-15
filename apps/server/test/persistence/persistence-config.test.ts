import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parsePersistenceConfig } from '../../src/persistence/config/persistence-config';

const configWith = (databaseUrl: string) =>
  parsePersistenceConfig({
    DATABASE_URL: databaseUrl,
    CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  });

describe('parsePersistenceConfig', () => {
  it.each([
    'postgres://relay:relay@127.0.0.1:5432/relay',
    'postgresql://relay@/relay?host=%2Fvar%2Frun%2Fpostgresql',
    'postgresql:///relay?host=/var/run/postgresql',
  ])('accepts the Postgres URL %s', (databaseUrl) => {
    expect(configWith(databaseUrl).databaseUrl).toBe(databaseUrl);
  });

  it.each(['mysql://relay@db/relay', 'relay', 'http://relay@db/relay', ' postgres://db/relay'])(
    'rejects the non-Postgres URL %s',
    (databaseUrl) => {
      expect(() => configWith(databaseUrl)).toThrow(
        /Invalid persistence configuration: DATABASE_URL/,
      );
    },
  );
});
