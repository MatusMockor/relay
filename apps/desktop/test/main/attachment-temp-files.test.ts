import { chmod, mkdir, readdir, readFile, stat, symlink } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentTempFiles } from '../../src/main/files/attachment-temp-files';
import { createTempDir, type TempDir } from './support/temp-dir';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const POSIX = process.platform !== 'win32';

describe('private folder for opened attachment copies', () => {
  let dir: TempDir;
  let root: string;

  beforeEach(async () => {
    dir = await createTempDir();
    root = dir.file('opened-attachments');
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('writes each copy into its own new folder inside the root', async () => {
    const files = new AttachmentTempFiles(root);

    const first = await files.write('faktura.pdf', PDF);
    const second = await files.write('faktura.pdf', PDF);

    expect(dirname(dirname(first))).toBe(root);
    expect(dirname(first)).not.toBe(dirname(second));
    expect(basename(first)).toBe('faktura.pdf');
    expect(new Uint8Array(await readFile(first))).toEqual(PDF);
    expect(await readdir(root)).toHaveLength(2);
  });

  it.runIf(POSIX)('keeps the root and every copy folder private to the user', async () => {
    const path = await new AttachmentTempFiles(root).write('faktura.pdf', PDF);

    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it.runIf(POSIX)('refuses a root that is a symlink to another folder', async () => {
    const elsewhere = dir.file('elsewhere');
    await mkdir(elsewhere, { mode: 0o700 });
    await symlink(elsewhere, root);

    await expect(new AttachmentTempFiles(root).write('faktura.pdf', PDF)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(await readdir(elsewhere)).toEqual([]);
  });

  it.runIf(POSIX)('refuses a root other users can read or write', async () => {
    await mkdir(root);
    await chmod(root, 0o777);

    await expect(new AttachmentTempFiles(root).write('faktura.pdf', PDF)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(await readdir(root)).toEqual([]);
  });

  it.runIf(POSIX)('refuses a root owned by another user', async () => {
    await mkdir(root, { mode: 0o700 });
    const files = new AttachmentTempFiles(root, {
      platform: process.platform,
      uid: (process.getuid?.() ?? 0) + 1,
    });

    await expect(files.write('faktura.pdf', PDF)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(await readdir(root)).toEqual([]);
  });

  it('clears all copies on startup', async () => {
    const files = new AttachmentTempFiles(root);
    await files.write('faktura.pdf', PDF);

    await files.clear();

    expect(await readdir(dir.path)).toEqual([]);
  });
});
