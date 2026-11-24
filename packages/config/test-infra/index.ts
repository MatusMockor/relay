export * from './google-calendar-stub';
export * from './jira-cloud-stub';
export * from './linear-stub';
export * from './github-stub';
export * from './stub-http';

export interface PostgresTestInfra {
  readonly url: string;
}

export interface GreenMailUser {
  readonly email: string;
  readonly login: string;
  readonly password: string;
}

export interface GreenMailTestInfra {
  readonly host: string;
  readonly imapPort: number;
  readonly smtpPort: number;
  readonly imapsPort: number;
  readonly smtpsPort: number;
  readonly apiUrl: string;
  readonly user: GreenMailUser;
}

export interface TestInfra {
  readonly postgres: PostgresTestInfra;
  readonly greenmail: GreenMailTestInfra;
}

type Env = Readonly<Record<string, string | undefined>>;

const readPort = (env: Env, key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return fallback;
  }
  return port;
};

const readString = (env: Env, key: string, fallback: string): string => {
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return raw;
};

export const resolveTestInfra = (env: Env): TestInfra => {
  const host = readString(env, 'GREENMAIL_HOST', '127.0.0.1');
  return {
    postgres: {
      url: readString(env, 'TEST_DATABASE_URL', 'postgres://relay:relay@127.0.0.1:5433/relay_test'),
    },
    greenmail: {
      host,
      imapPort: readPort(env, 'GREENMAIL_IMAP_PORT', 3143),
      smtpPort: readPort(env, 'GREENMAIL_SMTP_PORT', 3025),
      imapsPort: readPort(env, 'GREENMAIL_IMAPS_PORT', 3993),
      smtpsPort: readPort(env, 'GREENMAIL_SMTPS_PORT', 3465),
      apiUrl: readString(env, 'GREENMAIL_API_URL', `http://${host}:8086`),
      user: {
        email: readString(env, 'GREENMAIL_USER_EMAIL', 'relay@relay.test'),
        login: readString(env, 'GREENMAIL_USER_LOGIN', 'relay@relay.test'),
        password: readString(env, 'GREENMAIL_USER_PASSWORD', 'relay-secret'),
      },
    },
  };
};

export const testInfra: TestInfra = resolveTestInfra(process.env);
