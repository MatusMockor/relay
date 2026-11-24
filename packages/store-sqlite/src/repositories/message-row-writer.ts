import type { MessageHeaders } from '@relay/engine';
import type { Message } from '@relay/shared/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { toMessageRow } from '../mappers/message-mapper';
import { messageLabels, messages } from '../schema';
import { accountOwnerOf } from './account-owner';

export interface GateColumns {
  readonly jiraEffectsAt?: string | null;
  readonly inviteEffectsAt?: string | null;
}

export const writeMessageRow = (
  db: RelayDb,
  message: Message,
  headers: MessageHeaders,
  gates: GateColumns = {},
): void => {
  const row = toMessageRow(accountOwnerOf(db, message.accountId), message, headers);
  const { id: _id, ...changes } = row;
  db.insert(messages)
    .values({ ...row, ...gates })
    .onConflictDoUpdate({ target: messages.id, set: changes })
    .run();
};

export const replaceLabels = (
  db: RelayDb,
  messageId: string,
  labelIds: readonly string[],
): void => {
  db.delete(messageLabels).where(eq(messageLabels.messageId, messageId)).run();
  const unique = [...new Set(labelIds)];
  if (unique.length === 0) {
    return;
  }
  db.insert(messageLabels)
    .values(unique.map((labelId) => ({ messageId, labelId })))
    .run();
};

export const fillEmailId = (db: RelayDb, messageId: string, emailId: string): void => {
  db.update(messages)
    .set({ emailId })
    .where(and(eq(messages.id, messageId), isNull(messages.emailId)))
    .run();
};
