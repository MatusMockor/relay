import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  AttachmentFilenameSchema,
  contentTypeForFilename,
  MAX_ATTACHMENT_BYTES,
} from '@relay/shared/domain';
import type { PickedFile, PickedFiles, RejectedFile, RejectedFileReason } from '@relay/shared/ipc';

type Outcome =
  | { readonly kind: 'picked'; readonly file: PickedFile }
  | { readonly kind: 'rejected'; readonly file: RejectedFile };

const rejected = (filename: string, reason: RejectedFileReason): Outcome => ({
  kind: 'rejected',
  file: { filename: filename.slice(0, 1024) || 'súbor', reason },
});

const sizeOf = async (path: string): Promise<number | null> => {
  const info = await stat(path).catch(() => null);
  return info?.isFile() === true ? info.size : null;
};

export class PickedFileReader {
  async read(paths: readonly string[], budgetBytes: number): Promise<PickedFiles> {
    const outcomes: Outcome[] = [];
    let remaining = budgetBytes;
    for (const path of paths) {
      const outcome = await this.readOne(path, remaining);
      if (outcome.kind === 'picked') {
        remaining -= outcome.file.content.byteLength;
      }
      outcomes.push(outcome);
    }
    return {
      files: outcomes.flatMap((outcome) => (outcome.kind === 'picked' ? [outcome.file] : [])),
      rejected: outcomes.flatMap((outcome) => (outcome.kind === 'rejected' ? [outcome.file] : [])),
    };
  }

  private async readOne(path: string, remaining: number): Promise<Outcome> {
    const name = basename(path);
    const filename = AttachmentFilenameSchema.safeParse(name);
    const size = await sizeOf(path);
    if (!filename.success || size === null) {
      return rejected(name, 'unreadable');
    }
    if (size > MAX_ATTACHMENT_BYTES) {
      return rejected(name, 'too_large');
    }
    if (size > remaining) {
      return rejected(name, 'total_exceeded');
    }
    const content = await readFile(path).catch(() => null);
    if (content === null || content.byteLength > Math.min(remaining, MAX_ATTACHMENT_BYTES)) {
      return rejected(name, content === null ? 'unreadable' : 'total_exceeded');
    }
    return {
      kind: 'picked',
      file: {
        filename: filename.data,
        contentType: contentTypeForFilename(filename.data),
        content: new Uint8Array(content.buffer, content.byteOffset, content.byteLength),
      },
    };
  }
}
