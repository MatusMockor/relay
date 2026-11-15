import type { LabelId, MessageId } from '@relay/shared/domain';
import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { labels, messageLabels, messages } from '../../schema';

export const replaceMessageLabels = async (
  db: DbExecutor,
  messageId: MessageId,
  labelIds: readonly LabelId[],
): Promise<void> => {
  await db.execute(sql`select 1 from ${messages} where ${messages.id} = ${messageId} for update`);
  await db.delete(messageLabels).where(eq(messageLabels.messageId, messageId));
  if (labelIds.length === 0) {
    return;
  }
  await db.execute(sql`
    insert into ${messageLabels} (message_id, label_id, user_id)
    select ${messages.id}, ${labels.id}, ${messages.userId}
    from ${messages}
    join ${labels} on ${labels.accountId} = ${messages.accountId}
    where ${messages.id} = ${messageId} and ${labels.id} in ${[...labelIds]}
    on conflict do nothing
  `);
};
