import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { ValidationError } from '@relay/engine';
import { safeFilename } from './safe-filename';

const isInside = (root: string, path: string): boolean => {
  const fromRoot = relative(root, path);
  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot);
};

export class AttachmentTempFiles {
  constructor(
    private readonly root: string,
    private readonly newId: () => string = randomUUID,
  ) {}

  async write(filename: string, content: Uint8Array): Promise<string> {
    const directory = join(this.root, this.newId());
    const path = join(directory, safeFilename(filename));
    if (!isInside(this.root, directory) || !isInside(directory, path)) {
      throw new ValidationError('Neplatný názov prílohy');
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path, content, { mode: 0o600, flag: 'wx' });
    return path;
  }

  async clear(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}
