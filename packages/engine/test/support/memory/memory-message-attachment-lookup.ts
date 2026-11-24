import type { AttachmentId, Message, UserId } from '@relay/shared/domain';
import type { MessageAttachmentLookup } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryMessageAttachmentLookup implements MessageAttachmentLookup {
  constructor(private readonly db: MemoryDatabase) {}

  findByAttachmentId(userId: UserId, attachmentId: AttachmentId): Promise<Message | null> {
    const owned = new Set(
      [...this.db.tables.accounts.values()]
        .filter((account) => account.userId === userId)
        .map((account) => account.id),
    );
    const found = [...this.db.tables.messages.values()].find(
      (message) =>
        owned.has(message.accountId) &&
        message.attachments.some((attachment) => attachment.id === attachmentId),
    );
    return Promise.resolve(found ?? null);
  }
}
