import type { Env } from './env';

export const SERVER_CONFIG = Symbol.for('relay.server.ServerConfig');

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tokenEndpoint: string | null;
}

export interface ServerConfig {
  readonly env: Env['NODE_ENV'];
  readonly http: {
    readonly host: string;
    readonly port: number;
    readonly publicUrl: string;
    readonly trustProxyHops: number;
  };
  readonly database: {
    readonly url: string;
    readonly migrateOnStart: boolean;
    readonly poolMax: number;
  };
  readonly auth: {
    readonly accessTokenSecret: string;
    readonly refreshTokenSecret: string;
    readonly accessTokenTtlSeconds: number;
    readonly refreshTokenTtlSeconds: number;
    readonly registrationEnabled: boolean;
    readonly rateLimit: { readonly maxRequests: number; readonly windowMs: number };
  };
  readonly credentialsEncryptionKey: Buffer;
  readonly google: GoogleOAuthConfig | null;
  readonly mail: { readonly allowPlaintext: boolean };
  readonly jobs: {
    readonly enabled: boolean;
    readonly tickMs: number;
    readonly imapIdleEnabled: boolean;
    readonly pollingIntervalSeconds: number;
  };
  readonly ai: { readonly cliPath: string | null };
  readonly calendar: {
    readonly allowPrivateNetworks: boolean;
    readonly feedRefreshSeconds: number;
    readonly caFile: string | null;
    readonly googleApiUrl: string | null;
    readonly googleSyncSeconds: number;
  };
  readonly attachments: {
    readonly sweepIntervalSeconds: number;
    readonly sweepGraceSeconds: number;
  };
}

const readGoogle = (env: Env): GoogleOAuthConfig | null => {
  if (env.GOOGLE_OAUTH_CLIENT_ID === undefined || env.GOOGLE_OAUTH_CLIENT_SECRET === undefined) {
    return null;
  }
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    tokenEndpoint: env.GOOGLE_OAUTH_TOKEN_ENDPOINT ?? null,
  };
};

export const toServerConfig = (env: Env): ServerConfig => ({
  env: env.NODE_ENV,
  http: {
    host: env.HOST,
    port: env.PORT,
    publicUrl: env.PUBLIC_URL ?? `http://localhost:${env.PORT}`,
    trustProxyHops: env.TRUST_PROXY_HOPS,
  },
  database: {
    url: env.DATABASE_URL,
    migrateOnStart: env.DATABASE_MIGRATE_ON_START,
    poolMax: env.DATABASE_POOL_MAX,
  },
  auth: {
    accessTokenSecret: env.JWT_ACCESS_SECRET,
    refreshTokenSecret: env.JWT_REFRESH_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    registrationEnabled: env.REGISTRATION_ENABLED,
    rateLimit: {
      maxRequests: env.AUTH_RATE_LIMIT_MAX,
      windowMs: env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  },
  credentialsEncryptionKey: Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, 'base64'),
  google: readGoogle(env),
  mail: { allowPlaintext: env.MAIL_ALLOW_PLAINTEXT },
  jobs: {
    enabled: env.JOBS_ENABLED,
    tickMs: env.JOBS_TICK_MS,
    imapIdleEnabled: env.IMAP_IDLE_ENABLED,
    pollingIntervalSeconds: env.JOBS_POLL_INTERVAL_SECONDS,
  },
  ai: { cliPath: env.AI_CLI_PATH ?? null },
  calendar: {
    allowPrivateNetworks: env.CALENDAR_FEEDS_ALLOW_PRIVATE_NETWORKS,
    feedRefreshSeconds: env.CALENDAR_FEED_REFRESH_SECONDS,
    caFile: env.CALENDAR_FEEDS_CA_FILE ?? null,
    googleApiUrl: env.GOOGLE_CALENDAR_API_URL ?? null,
    googleSyncSeconds: env.GOOGLE_CALENDAR_SYNC_SECONDS,
  },
  attachments: {
    sweepIntervalSeconds: env.ATTACHMENT_SWEEP_INTERVAL_SECONDS,
    sweepGraceSeconds: env.ATTACHMENT_SWEEP_GRACE_SECONDS,
  },
});
