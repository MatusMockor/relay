import { randomInt } from 'node:crypto';
import { link, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';

export interface PortLease {
  readonly port: number;
  release(): Promise<void>;
}

const FIRST_PORT = 20_000;
const PORT_COUNT = 10_000;
const ATTEMPTS = 50;

const lockPathOf = (port: number): string =>
  join(tmpdir(), `relay-desktop-real-server-${String(port)}.lock`);

const writeLock = async (path: string): Promise<boolean> => {
  const draft = `${path}.${String(process.pid)}.${String(randomInt(1_000_000))}`;
  await writeFile(draft, String(process.pid));
  const linked = await link(draft, path).then(
    () => true,
    () => false,
  );
  await rm(draft, { force: true });
  return linked;
};

const isBindable = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      resolve(false);
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => {
        resolve(true);
      });
    });
  });

const tryLease = async (port: number): Promise<PortLease | null> => {
  const lockPath = lockPathOf(port);
  if (!(await writeLock(lockPath))) {
    return null;
  }
  const release = () => rm(lockPath, { force: true });
  if (await isBindable(port)) {
    return { port, release };
  }
  await release();
  return null;
};

export const leasePort = async (): Promise<PortLease> => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const lease = await tryLease(FIRST_PORT + randomInt(PORT_COUNT));
    if (lease !== null) {
      return lease;
    }
  }
  expect.fail(`No free port for the Relay server after ${String(ATTEMPTS)} attempts`);
};
