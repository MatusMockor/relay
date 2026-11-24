import { describe, expect, it } from 'vitest';
import { deliverMail, present } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import { historyDate } from '../support/history';
import { moveRecords } from '../support/mail/fake-writes';
import type { MemoryDatabase } from '../support/memory/memory-database';
import { MemoryMessageBodies } from '../support/memory/memory-message-bodies';
import { searchServer } from '../support/server-search';
import { createTestEngine, USER_ID } from '../support/test-engine';

const OLD = {
  id: 'old-invoice',
  subject: 'Ročné vyúčtovanie',
  date: historyDate(10, 100),
  body: 'V prílohe posielam vyúčtovanie.',
};

describe('filling a header-only body from a placement fetch', () => {
  it('stores the body when INBOX brings the full source of a search hit', async () => {
    const engine = createTestEngine({
      messageBodies: (db: MemoryDatabase) => new MemoryMessageBodies(db),
    });
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'Archive', OLD);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const response = await searchServer(engine, 'vyúčtovanie');
    const hit = present(response.hits[0]);
    expect(engine.db.tables.messages.get(hit.messageId)).toMatchObject({
      bodyState: 'remote',
      textBody: null,
    });

    await moveRecords(server.mailbox('Archive'), server, [1], 'INBOX');
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const filled = present(engine.db.tables.messages.get(hit.messageId));
    expect(filled.bodyState).toBeUndefined();
    expect(filled.textBody).toBe(OLD.body);
    expect(filled.placements).toHaveLength(2);
    expect(engine.db.tables.messages.size).toBe(1);
  });
});
