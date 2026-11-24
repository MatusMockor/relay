import { type DraftContent, MessageIdSchema } from '@relay/shared/domain';
import type { RelayDb } from '../database/sqlite-database';
import { resolveMessageId } from './message-alias-resolver';

export const withResolvedReplyTarget = <Content extends Partial<DraftContent>>(
  db: RelayDb,
  content: Content,
): Content => {
  const messageId = content.inReplyToMessageId ?? null;
  if (messageId === null) {
    return content;
  }
  return { ...content, inReplyToMessageId: MessageIdSchema.parse(resolveMessageId(db, messageId)) };
};
