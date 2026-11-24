import { inArray, type SQL, sql } from 'drizzle-orm';
import { messages } from '../../schema';

export const replyThreadCondition = (messageIds: readonly string[]): SQL => {
  const unique = [...new Set(messageIds)];
  const hashes = sql.join(
    unique.map((messageId) => sql`md5(${messageId})`),
    sql`, `,
  );
  return sql`md5(${messages.inReplyTo}) in (${hashes}) and ${inArray(messages.inReplyTo, unique)}`;
};
