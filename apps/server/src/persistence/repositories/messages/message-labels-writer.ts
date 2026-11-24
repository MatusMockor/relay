import type { LabelId, MessageId } from '@relay/shared/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { labels, messageLabels, messages } from '../../schema';
import { resolvedMessageId } from '../../support/message-alias';

export const replaceMessageLabels = async (
  db: DbExecutor,
  messageId: MessageId,
  labelIds: readonly LabelId[],
): Promise<void> => {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.id, resolvedMessageId(messageId)))
    .for('update');
  if (row === undefined) {
    return;
  }
  await db.delete(messageLabels).where(eq(messageLabels.messageId, row.id));
  if (labelIds.length === 0) {
    return;
  }
  await db.execute(sql`
    insert into ${messageLabels} (message_id, label_id, user_id)
    select ${messages.id}, ${labels.id}, ${messages.userId}
    from ${messages}
    join ${labels} on ${labels.accountId} = ${messages.accountId}
    where ${messages.id} = ${row.id} and ${labels.id} in ${[...labelIds]}
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
    where ${messages.id} = ${resolvedMessageId(messageId)} and ${labels.id} = ${labelId}
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
    .where(
      and(
        eq(messageLabels.messageId, resolvedMessageId(messageId)),
        eq(messageLabels.labelId, labelId),
      ),
    );
};
