import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AttachmentStore,
  AttachmentUpload,
  IdGenerator,
  StoredAttachment,
} from '@relay/engine';
import { ValidationError } from '@relay/engine';
import {
  type AttachmentId,
  type DraftAttachment,
  DraftAttachmentSchema,
  MAX_ATTACHMENT_BYTES,
  type UserId,
  UserIdSchema,
} from '@relay/shared/domain';
import { z } from 'zod';
import { parseJsonOrNull } from './parse-json';

const AttachmentMetaSchema = z.object({ userId: UserIdSchema, attachment: DraftAttachmentSchema });

export class FileAttachmentStore implements AttachmentStore {
  constructor(
    private readonly directory: string,
    private readonly ids: IdGenerator,
  ) {}

  async put(userId: UserId, upload: AttachmentUpload): Promise<DraftAttachment> {
    if (upload.content.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError('Príloha je väčšia ako 25 MB');
    }
    const attachment = DraftAttachmentSchema.parse({
      id: this.ids.generate('attachment'),
      filename: upload.filename,
      contentType: upload.contentType,
      size: upload.content.byteLength,
    });
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(this.contentPath(attachment.id), upload.content, { mode: 0o600 });
    await writeFile(this.metaPath(attachment.id), JSON.stringify({ userId, attachment }), {
      mode: 0o600,
    });
    return attachment;
  }

  async get(userId: UserId, attachmentId: AttachmentId): Promise<StoredAttachment | null> {
    const meta = await this.readMeta(attachmentId);
    if (meta === null || meta.userId !== userId) {
      return null;
    }
    const content = await readFile(this.contentPath(attachmentId)).catch(() => null);
    if (content === null) {
      return null;
    }
    return { attachment: meta.attachment, content: new Uint8Array(content) };
  }

  async delete(userId: UserId, attachmentId: AttachmentId): Promise<boolean> {
    const meta = await this.readMeta(attachmentId);
    if (meta === null || meta.userId !== userId) {
      return false;
    }
    await rm(this.contentPath(attachmentId), { force: true });
    await rm(this.metaPath(attachmentId), { force: true });
    return true;
  }

  private async readMeta(attachmentId: AttachmentId) {
    const raw = await readFile(this.metaPath(attachmentId), 'utf8').catch(() => null);
    if (raw === null) {
      return null;
    }
    const parsed = AttachmentMetaSchema.safeParse(parseJsonOrNull(raw));
    return parsed.success ? parsed.data : null;
  }

  private contentPath(attachmentId: AttachmentId): string {
    return join(this.directory, `${attachmentId}.bin`);
  }

  private metaPath(attachmentId: AttachmentId): string {
    return join(this.directory, `${attachmentId}.json`);
  }
}
