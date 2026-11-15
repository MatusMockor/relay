import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env';
import { toServerConfig } from '../src/config/server-config';

const required = {
  DATABASE_URL: 'postgres://relay:relay@localhost:5432/relay',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const config = toServerConfig(parseEnv(required));
    expect(config.http).toEqual({
      host: '0.0.0.0',
      port: 3000,
      publicUrl: 'http://localhost:3000',
      trustProxyHops: 1,
    });
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.auth.registrationEnabled).toBe(true);
    expect(config.auth.rateLimit).toEqual({ maxRequests: 20, windowMs: 60_000 });
    expect(config.google).toBeNull();
    expect(config.jobs).toEqual({
      enabled: true,
      tickMs: 15_000,
      imapIdleEnabled: true,
      pollingIntervalSeconds: 2,
    });
    expect(config.credentialsEncryptionKey).toHaveLength(32);
    expect(config.database).toMatchObject({ migrateOnStart: true, poolMax: 10 });
  });

  it('validates the database pool and migration flags', () => {
    const config = toServerConfig(
      parseEnv({ ...required, DATABASE_MIGRATE_ON_START: 'false', DATABASE_POOL_MAX: '25' }),
    );
    expect(config.database).toMatchObject({ migrateOnStart: false, poolMax: 25 });
    expect(() => parseEnv({ ...required, DATABASE_POOL_MAX: '0' })).toThrow(/DATABASE_POOL_MAX/);
    expect(() => parseEnv({ ...required, DATABASE_MIGRATE_ON_START: 'maybe' })).toThrow(
      /DATABASE_MIGRATE_ON_START/,
    );
  });

  it('parses flags, numbers and the google client', () => {
    const config = toServerConfig(
      parseEnv({
        ...required,
        PORT: '4100',
        TRUST_PROXY_HOPS: '0',
        REGISTRATION_ENABLED: 'false',
        GOOGLE_OAUTH_CLIENT_ID: 'client',
        GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
        PUBLIC_URL: 'https://relay.example.com',
      }),
    );
    expect(config.http.port).toBe(4100);
    expect(config.http.publicUrl).toBe('https://relay.example.com');
    expect(config.http.trustProxyHops).toBe(0);
    expect(config.auth.registrationEnabled).toBe(false);
    expect(config.google).toEqual({
      clientId: 'client',
      clientSecret: 'secret',
      tokenEndpoint: null,
    });
  });

  it('treats empty values as unset', () => {
    const config = toServerConfig(
      parseEnv({
        ...required,
        GOOGLE_OAUTH_CLIENT_ID: '',
        GOOGLE_OAUTH_CLIENT_SECRET: '',
        PORT: '',
      }),
    );
    expect(config.google).toBeNull();
    expect(config.http.port).toBe(3000);
  });

  it('accepts a socket Postgres URL with an empty host', () => {
    const databaseUrl = 'postgresql://relay@/relay?host=%2Fvar%2Frun%2Fpostgresql';
    expect(parseEnv({ ...required, DATABASE_URL: databaseUrl }).DATABASE_URL).toBe(databaseUrl);
  });

  it('rejects missing and invalid values with a readable message', () => {
    expect(() => parseEnv({ ...required, PORT: 'abc', DATABASE_URL: 'mysql://x' })).toThrow(
      /Invalid server environment: PORT: .*; DATABASE_URL: /,
    );
    expect(() => parseEnv({ ...required, CREDENTIALS_ENCRYPTION_KEY: 'short' })).toThrow(
      /CREDENTIALS_ENCRYPTION_KEY: must be 32 bytes/,
    );
    expect(() => parseEnv({ ...required, JWT_ACCESS_SECRET: 'x' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
