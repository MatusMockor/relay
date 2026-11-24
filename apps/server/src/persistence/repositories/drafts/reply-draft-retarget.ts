import type { MessageId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { drafts } from '../../schema';
import { resolvedMessageId } from '../../support/message-alias';

export const retargetReplyDrafts = async (
  db: DbExecutor,
  from: MessageId,
  to: MessageId,
): Promise<void> => {
  await db
    .update(drafts)
    .set({ inReplyToMessageId: resolvedMessageId(to) })
    .where(eq(drafts.inReplyToMessageId, from));
};
