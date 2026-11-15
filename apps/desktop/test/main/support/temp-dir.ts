import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TempDir {
  readonly path: string;
  file(name: string): string;
  remove(): Promise<void>;
}

export const createTempDir = async (prefix = 'relay-desktop-'): Promise<TempDir> => {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return {
    path,
    file: (name) => join(path, name),
    remove: () => rm(path, { recursive: true, force: true }),
  };
};
