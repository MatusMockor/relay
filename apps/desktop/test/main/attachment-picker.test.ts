import { truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentPicker } from '../../src/main/files/attachment-picker';
import type { FileDialog } from '../../src/main/files/file-dialog';
import { PickedFileReader } from '../../src/main/files/picked-file-reader';
import { createTempDir, type TempDir } from './support/temp-dir';

const MB = 1024 * 1024;

class ChosenFiles implements FileDialog {
  constructor(private readonly paths: readonly string[]) {}

  chooseFiles(): Promise<readonly string[]> {
    return Promise.resolve(this.paths);
  }
}

describe('AttachmentPicker', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('reads chosen files with a content type and rejects oversized, over budget and unreadable ones', async () => {
    const pdf = join(dir.path, 'cenová ponuka.pdf');
    const big = join(dir.path, 'video.mp4');
    const second = join(dir.path, 'druhý.txt');
    await writeFile(pdf, 'pdf');
    await writeFile(big, '');
    await truncate(big, 25 * MB + 1);
    await writeFile(second, 'x'.repeat(10));
    const picker = new AttachmentPicker(
      new ChosenFiles([pdf, big, second, join(dir.path, 'chyba.doc'), dir.path]),
      new PickedFileReader(),
    );

    const picked = await picker.pick(5);

    expect(
      picked.files.map((file) => [file.filename, file.contentType, file.content.byteLength]),
    ).toEqual([['cenová ponuka.pdf', 'application/pdf', 3]]);
    expect(picked.rejected).toEqual([
      { filename: 'video.mp4', reason: 'too_large' },
      { filename: 'druhý.txt', reason: 'total_exceeded' },
      { filename: 'chyba.doc', reason: 'unreadable' },
      { filename: expect.any(String) as string, reason: 'unreadable' },
    ]);
  });

  it('returns nothing when the dialog is cancelled', async () => {
    const picker = new AttachmentPicker(new ChosenFiles([]), new PickedFileReader());

    await expect(picker.pick(25 * MB)).resolves.toEqual({ files: [], rejected: [] });
  });
});
