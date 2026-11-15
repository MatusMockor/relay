import { mkdir, readdir, writeFile } from 'node:fs/promises';
import type { IdGenerator } from '@relay/engine';
import { type EntityIdMap, type EntityKind, UserIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AtomicFile } from '../../src/main/storage/atomic-file';
import { FileAttachmentStore } from '../../src/main/storage/file-attachment-store';
import { createTempDir, type TempDir } from './support/temp-dir';

class SequentialIds implements IdGenerator {
  private counter = 0;

  generate<Kind extends EntityKind>(kind: Kind): EntityIdMap[Kind] {
    this.counter += 1;
    return `${kind}_${String(this.counter)}` as EntityIdMap[Kind];
  }
}

describe('file storage cleanup after a failed write', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('removes the temporary file when replacing the target fails', async () => {
    await mkdir(dir.file('settings.json/occupied'), { recursive: true });
    const file = new AtomicFile(dir.file('settings.json'));

    await expect(file.write('{"mode":"local"}')).rejects.toBeInstanceOf(Error);
    await expect(file.write('{"mode":"local"}')).rejects.toBeInstanceOf(Error);

    expect(await readdir(dir.path)).toEqual(['settings.json']);
  });

  it('removes the attachment content when its metadata cannot be written', async () => {
    const directory = dir.file('attachments');
    await mkdir(`${directory}/attachment_1.json`, { recursive: true });
    await writeFile(`${directory}/attachment_1.json/occupied`, '');
    const store = new FileAttachmentStore(directory, new SequentialIds());

    await expect(
      store.put(UserIdSchema.parse('usr_local'), {
        filename: 'faktura.pdf',
        contentType: 'application/pdf',
        content: new Uint8Array(1024),
      }),
    ).rejects.toBeInstanceOf(Error);

    expect(await readdir(directory)).toEqual(['attachment_1.json']);
  });
});
