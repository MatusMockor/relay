import { NotFoundError } from '@relay/engine';
import type { DraftContent, UserId } from '@relay/shared/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages } from '../../schema';
import { resolvedMessageId } from '../../support/message-alias';
import { assertOwned } from '../../support/ownership';

const ownedReplyTarget = async (
  db: DbExecutor,
  userId: UserId,
  messageId: string,
): Promise<DraftContent['inReplyToMessageId']> => {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, resolvedMessageId(messageId)), eq(messages.userId, userId)));
  if (row === undefined) {
    throw new NotFoundError('Message', messageId);
  }
  return row.id;
};

export const withDraftReferences = async <Content extends Partial<DraftContent>>(
  db: DbExecutor,
  userId: UserId,
  content: Content,
): Promise<Content> => {
  await assertOwned(db, 'Account', userId, content.accountId ?? null);
  await assertOwned(db, 'Thread', userId, content.inReplyToThreadId ?? null);
  const messageId = content.inReplyToMessageId ?? null;
  if (messageId === null) {
    return content;
  }
  return { ...content, inReplyToMessageId: await ownedReplyTarget(db, userId, messageId) };
};
