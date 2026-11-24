import type { MessageUidLookup } from '@relay/engine';
import type { MailboxId, Message } from '@relay/shared/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toMessage } from '../mappers/message-mapper';
import { messages } from '../schema';
import { chunked } from './chunked';
import { readMessageLabels } from './message-label-reader';

export class SqliteMessageUidLookup implements MessageUidLookup {
  constructor(private readonly executor: SqliteExecutor) {}

  findByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<Message[]> {
    return this.executor.execute((db) => {
      const rows = chunked([...new Set(uids)]).flatMap((chunk) =>
        db
          .select()
          .from(messages)
          .where(and(eq(messages.mailboxId, mailboxId), inArray(messages.uid, chunk)))
          .orderBy(asc(messages.uid))
          .all(),
      );
      const labels = readMessageLabels(
        db,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toMessage(row, labels.get(row.id) ?? []));
    });
  }
}
