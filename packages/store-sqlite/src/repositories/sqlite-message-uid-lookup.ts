import type { MessageUidLookup } from '@relay/engine';
import type { MailboxId, Message } from '@relay/shared/domain';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { hydrateMessages } from './message-hydrator';
import { findRowsAtUids } from './message-location-queries';

export class SqliteMessageUidLookup implements MessageUidLookup {
  constructor(private readonly executor: SqliteExecutor) {}

  findByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<Message[]> {
    return this.executor.execute((db) => hydrateMessages(db, findRowsAtUids(db, mailboxId, uids)));
  }
}
