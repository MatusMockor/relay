import { chmod, lstat, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';

export type RestrictAccess = (path: string) => Promise<void>;

export const restrictToOwner: RestrictAccess = (path) => chmod(path, 0o600);

export async function removeStaleSocket(path: string): Promise<void> {
  const entry = await lstat(path).catch((error: unknown) => {
    if (errorCode(error) === 'ENOENT') {
      return null;
    }
    throw error;
  });
  if (entry === null) {
    return;
  }
  if (!entry.isSocket()) {
    throw new Error(`Refusing to replace ${path}: it is not a socket`);
  }
  if (await acceptsConnections(path)) {
    throw new Error(`Mail tool socket ${path} is already in use`);
  }
  await rm(path, { force: true });
}

function acceptsConnections(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createConnection(path);
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', (error) => {
      resolve(errorCode(error) !== 'ECONNREFUSED');
    });
  });
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}
