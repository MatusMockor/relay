import { expect } from 'vitest';
import { leasePort, type PortLease } from './port-lease';
import { createServerDatabase, type ServerDatabase } from './server-database';
import { type ServerEnvOverrides, serverEnv } from './server-env';
import { type Readiness, waitForHealth } from './server-health';
import { type ServerProcess, spawnServerProcess } from './server-process';
import { backoff, TRANSIENT_POSTGRES_LOG } from './transient-postgres';

export interface RelayServer {
  readonly url: string;
  readonly databaseName: string;
  readonly pid: number | undefined;
  logs(): string;
  close(): Promise<void>;
}

export interface RelayServerOptions {
  readonly env?: ServerEnvOverrides;
}

export const SERVER_HOOK_TIMEOUT_MS = 120_000;

const NO_AI_CLI_DIR = '/nonexistent-relay-desktop-ai-bin';
const BOOT_ATTEMPTS = 4;
const BOOT_BUDGET_MS = 90_000;

interface Boot {
  readonly url: string;
  readonly lease: PortLease;
  readonly process: ServerProcess;
  readonly readiness: Readiness;
}

const bootOnce = async (
  database: ServerDatabase,
  options: RelayServerOptions,
  deadline: number,
): Promise<Boot> => {
  const lease = await leasePort();
  const url = `http://127.0.0.1:${String(lease.port)}`;
  const process = spawnServerProcess(
    serverEnv({
      port: lease.port,
      databaseUrl: database.url,
      aiCliDir: NO_AI_CLI_DIR,
      overrides: options.env ?? {},
    }),
  );
  const readiness = await waitForHealth(url, process, Math.max(0, deadline - Date.now()));
  return { url, lease, process, readiness };
};

const release = async (boot: Boot): Promise<void> => {
  await boot.process.stop();
  await boot.lease.release();
};

const isRetryable = (attempt: Boot): boolean => {
  if (attempt.readiness !== 'exited') {
    return false;
  }
  const logs = attempt.process.logs();
  return logs.includes('EADDRINUSE') || TRANSIENT_POSTGRES_LOG.test(logs);
};

const boot = async (database: ServerDatabase, options: RelayServerOptions): Promise<Boot> => {
  const deadline = Date.now() + BOOT_BUDGET_MS;
  let attempt = await bootOnce(database, options, deadline);
  for (let retry = 1; retry < BOOT_ATTEMPTS && isRetryable(attempt); retry += 1) {
    await release(attempt);
    await backoff(retry);
    attempt = await bootOnce(database, options, deadline);
  }
  return attempt;
};

export const startRelayServer = async (options: RelayServerOptions = {}): Promise<RelayServer> => {
  const database = await createServerDatabase();
  const booting = boot(database, options);
  if (
    await booting.then(
      () => false,
      () => true,
    )
  ) {
    await database.drop();
  }
  const started = await booting;
  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= release(started).finally(() => database.drop());
    return closing;
  };
  if (started.readiness !== 'ready') {
    await close();
  }
  expect(started.readiness, started.process.logs()).toBe('ready');
  return {
    url: started.url,
    databaseName: database.name,
    pid: started.process.pid,
    logs: () => started.process.logs(),
    close,
  };
};
