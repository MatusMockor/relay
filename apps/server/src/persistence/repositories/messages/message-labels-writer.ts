import type { LabelId, MessageId } from '@relay/shared/domain';
import { and, eq, sql } from 'drizzle-orm';
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

export const addMessageLabel = async (
  db: DbExecutor,
  messageId: MessageId,
  labelId: LabelId,
): Promise<void> => {
  await db.execute(sql`
    insert into ${messageLabels} (message_id, label_id, user_id)
    select ${messages.id}, ${labels.id}, ${messages.userId}
    from ${messages}
    join ${labels} on ${labels.accountId} = ${messages.accountId}
    where ${messages.id} = ${messageId} and ${labels.id} = ${labelId}
    on conflict do nothing
  `);
};

export const removeMessageLabel = async (
  db: DbExecutor,
  messageId: MessageId,
  labelId: LabelId,
): Promise<void> => {
  await db
    .delete(messageLabels)
    .where(and(eq(messageLabels.messageId, messageId), eq(messageLabels.labelId, labelId)));
};
