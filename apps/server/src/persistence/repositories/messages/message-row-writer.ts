import { ConflictError, type MessageHeaders } from '@relay/engine';
import type { Message, MessageId } from '@relay/shared/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages } from '../../schema';
import { findAccountOwner } from '../../support/account-owner';
import type { GateColumns } from './message-effect-gates';
import { toStoredHeaders } from './message-headers';
import { toMessageInsert } from './message.mapper';

export const writeMessageRow = async (
  db: DbExecutor,
  message: Message,
  headers: MessageHeaders,
  gates: GateColumns = {},
): Promise<void> => {
  const userId = await findAccountOwner(db, message.accountId);
  const {
    id: _id,
    userId: _userId,
    ...changes
  } = toMessageInsert(userId, message, toStoredHeaders(headers));
  const written = await db
    .insert(messages)
    .values({ ...changes, ...gates, id: message.id, userId })
    .onConflictDoUpdate({
      target: messages.id,
      set: changes,
      setWhere: eq(messages.userId, userId),
    })
    .returning({ id: messages.id });
  if (written.length === 0) {
    throw new ConflictError(`Message ${message.id} belongs to another user`);
  }
};

export const fillEmailId = async (
  db: DbExecutor,
  messageId: MessageId,
  emailId: string,
): Promise<void> => {
  await db
    .update(messages)
    .set({ emailId })
    .where(and(eq(messages.id, messageId), isNull(messages.emailId)));
};
