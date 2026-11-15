import type { MessageAttachmentLookup } from '@relay/engine';
import type { AttachmentId, Message, UserId } from '@relay/shared/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages } from '../../schema';
import { toMessage } from './message.mapper';
import { messageSelection } from './message-selection';

export class PgMessageAttachmentLookup implements MessageAttachmentLookup {
  constructor(private readonly db: DbExecutor) {}

  async findByAttachmentId(userId: UserId, attachmentId: AttachmentId): Promise<Message | null> {
    const [row] = await this.db
      .select(messageSelection)
      .from(messages)
      .where(
        and(
          eq(messages.userId, userId),
          sql`${messages.attachments} @> ${JSON.stringify([{ id: attachmentId }])}::jsonb`,
        ),
      )
      .limit(1);
    return row === undefined ? null : toMessage(row);
  }
}
