import type { MessageId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  copyMergeRow,
  enqueueCopyMerge,
  expectMergeInvariants,
  storedMessages,
} from '../support/copy-merge';
import { present } from '../support/fixtures';
import { type LegacySpec, seedLegacyDuplicates } from '../support/legacy-duplicates';
import { gmailRecord } from '../support/mail/fake-gmail-messages';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPLIT: LegacySpec = { id: 's1', subject: 'Rozdelene', date: '2026-11-14T08:00:00.000Z' };
const PLAIN: LegacySpec = { id: 's2', subject: 'Obycajne', date: '2026-11-14T09:00:00.000Z' };
const STALE_ID = 'msg_stale_inbox' as MessageId;
const SIX_HOURS = 6 * 60 * 60_000;

const ids = (engine: TestEngine): string[] =>
  storedMessages(engine)
    .map((message) => message.id)
    .sort();

const moveToThread = (engine: TestEngine, id: MessageId, threadId: ThreadId): void => {
  const message = present(engine.db.tables.messages.get(id));
  engine.db.tables.messages.set(id, { ...message, threadId });
};

const secondInboxUid = (server: FakeMailServer, emailId: string): number => {
  const mailbox = server.mailbox('INBOX');
  const uid = mailbox.uidNext;
  mailbox.uidNext += 1;
  const state = present(server.gmailMessages.get(emailId));
  mailbox.messages.set(uid, gmailRecord(state, uid, server.bumpModseq(mailbox)));
  return uid;
};

const progressLogs = (engine: TestEngine) =>
  engine.logger.entries.filter((entry) => entry.message === 'Copy merge progress');

describe('CopyMergeBackfill skipped groups', () => {
  it('leaves groups that span threads separate without blocking retirement', async () => {
    const engine = createTestEngine();
    const { account, pairs } = await seedLegacyDuplicates(engine, [SPLIT, PLAIN]);
    const [split, plain] = pairs.map(present);
    moveToThread(engine, present(split).loserId, 'thr_elsewhere' as ThreadId);
    await enqueueCopyMerge(engine, account.id);

    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(ids(engine)).toEqual(
      [present(split).keeperId, present(split).loserId, present(plain).keeperId].sort(),
    );
    expect(await copyMergeRow(engine, account.id)).toBeNull();
    expect(progressLogs(engine).map((entry) => entry.context['spanning'])).toEqual([1, 1]);
    expectMergeInvariants(engine);
  });

  it('retries a same-mailbox conflict after the full expunge diff interval', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { account, server, inbox, pairs } = await seedLegacyDuplicates(engine, [SPLIT]);
    const pair = present(pairs[0]);
    const keeper = present(engine.db.tables.messages.get(pair.keeperId));
    const staleUid = secondInboxUid(server, present(keeper.emailId));
    const location = { mailboxId: inbox.id, uid: staleUid };
    await engine.repositories.messages.upsert(
      { ...keeper, id: STALE_ID, ...location, placements: [location] },
      new Map(),
    );
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await enqueueCopyMerge(engine, account.id);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(ids(engine)).toEqual([pair.keeperId, pair.loserId, STALE_ID].sort());
    const waiting = present(await copyMergeRow(engine, account.id));
    expect(waiting.payload.retryAfter).toBe(
      new Date(engine.clock.now().getTime() + SIX_HOURS).toISOString(),
    );
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect((await copyMergeRow(engine, account.id))?.revision).toBe(waiting.revision);

    server.expunge('INBOX', keeper.uid);
    engine.clock.advance(SIX_HOURS + 1);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(ids(engine)).toEqual([STALE_ID]);
    expect(present(engine.db.tables.messages.get(STALE_ID)).placements).toHaveLength(2);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(await copyMergeRow(engine, account.id)).toBeNull();
    expectMergeInvariants(engine);
  });
});
