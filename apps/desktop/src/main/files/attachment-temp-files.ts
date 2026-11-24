import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { ValidationError } from '@relay/engine';
import { safeAttachmentFilename } from '@relay/shared/domain';

const PRIVATE_MODE = 0o700;
const PERMISSION_BITS = 0o777;

const isInside = (root: string, path: string): boolean => {
  const fromRoot = relative(root, path);
  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot);
};

export interface DirectoryOwner {
  readonly platform: NodeJS.Platform;
  readonly uid: number | null;
}

const currentOwner = (): DirectoryOwner => ({
  platform: process.platform,
  uid: process.getuid?.() ?? null,
});

export class AttachmentTempFiles {
  constructor(
    private readonly root: string,
    private readonly owner: DirectoryOwner = currentOwner(),
  ) {}

  async write(filename: string, content: Uint8Array): Promise<string> {
    await mkdir(this.root, { recursive: true, mode: PRIVATE_MODE });
    await this.requirePrivate(this.root);
    const directory = await mkdtemp(join(this.root, 'open-'));
    await this.requirePrivate(directory);
    const path = join(directory, safeAttachmentFilename(filename));
    if (!isInside(this.root, directory) || !isInside(directory, path)) {
      throw new ValidationError('Neplatný názov prílohy');
    }
    await writeFile(path, content, { mode: 0o600, flag: 'wx' });
    return path;
  }

  async clear(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  private async requirePrivate(directory: string): Promise<void> {
    const stats = await lstat(directory);
    const ownedByUs = this.owner.uid === null || stats.uid === this.owner.uid;
    const privateMode =
      this.owner.platform === 'win32' || (stats.mode & PERMISSION_BITS) === PRIVATE_MODE;
    if (stats.isSymbolicLink() || !stats.isDirectory() || !ownedByUs || !privateMode) {
      throw new ValidationError('Priečinok pre otvorené prílohy nie je bezpečný');
    }
  }
}
