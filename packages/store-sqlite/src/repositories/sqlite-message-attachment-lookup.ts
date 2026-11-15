import type { MessageAttachmentLookup } from '@relay/engine';
import type { AttachmentId, Message, UserId } from '@relay/shared/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toMessage } from '../mappers/message-mapper';
import { messages } from '../schema';
import { readMessageLabels } from './message-label-reader';

export class SqliteMessageAttachmentLookup implements MessageAttachmentLookup {
  constructor(private readonly executor: SqliteExecutor) {}

  findByAttachmentId(userId: UserId, attachmentId: AttachmentId): Promise<Message | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.userId, userId),
            sql`exists (select 1 from json_each(${messages.attachments}) where json_extract(json_each.value, '$.id') = ${attachmentId})`,
          ),
        )
        .get();
      if (row === undefined) {
        return null;
      }
      return toMessage(row, readMessageLabels(db, [row.id]).get(row.id) ?? []);
    });
  }
}
