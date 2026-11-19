import type { Message, MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { RepairedMessageBody } from '../../src';
import {
  deliverMail,
  messageHeader,
  present,
  type SeededAccount,
  seedAccount,
} from '../support/fixtures';
import type { MemoryDatabase } from '../support/memory/memory-database';
import { MemoryMessageBodyRepairs } from '../support/memory/memory-message-body-repairs';
import {
  createTestEngine,
  type TestEngine,
  type TestEngineOptions,
  USER_ID,
} from '../support/test-engine';

const CORRECT_BODY = 'Dobrý deň, posielam faktúru.';
const CORRUPTED_BODY = 'Dobr\uFFFD de\uFFFD, posielam fakt\uFFFDru.';

const sync = (engine: TestEngine, seeded: SeededAccount) =>
  engine.services.sync.syncAccount(USER_ID, seeded.account.id);

const storedMessage = (engine: TestEngine, id: string): Message =>
  present(
    [...engine.db.tables.messages.values()].find(
      (message) => message.messageIdHeader === messageHeader(id),
    ),
  );

const corrupt = (engine: TestEngine, id: string): void => {
  const message = storedMessage(engine, id);
  engine.db.tables.messages.set(message.id, {
    ...message,
    textBody: CORRUPTED_BODY,
    snippet: CORRUPTED_BODY,
  });
  const thread = present(engine.db.tables.threads.get(message.threadId));
  engine.db.tables.threads.set(thread.id, { ...thread, snippet: CORRUPTED_BODY });
};

const queueRepair = async (
  engine: TestEngine,
  seeded: SeededAccount,
  path = 'INBOX',
): Promise<void> => {
  const mailbox = present(await engine.repositories.mailboxes.findByPath(seeded.account.id, path));
  await engine.repositories.pendingWork.put({
    accountId: seeded.account.id,
    kind: 'body-repair',
    ref: mailbox.id,
    payload: { mailboxId: mailbox.id, afterUid: 0 },
    createdAt: '2026-11-15T09:00:00.000Z',
  });
  seeded.server.fetchedMessages.length = 0;
  engine.events.clear();
};

class RefreshWatchingBodyRepairs extends MemoryMessageBodyRepairs {
  readonly refreshQueuedAtUpdate: boolean[] = [];

  constructor(private readonly database: MemoryDatabase) {
    super(database);
  }

  override updateBody(messageId: MessageId, body: RepairedMessageBody): Promise<void> {
    const threadId = this.database.tables.messages.get(messageId)?.threadId;
    this.refreshQueuedAtUpdate.push(
      [...this.database.tables.pendingWork.values()].some(
        (work) => work.kind === 'thread-refresh' && work.ref === threadId,
      ),
    );
    return super.updateBody(messageId, body);
  }
}

const seedMail = async (ids: readonly string[], options: TestEngineOptions = {}) => {
  const engine = createTestEngine(options);
  const seeded = await seedAccount(engine);
  ids.forEach((id) => deliverMail(seeded.server, 'INBOX', { id, body: CORRECT_BODY }));
  await sync(engine, seeded);
  return { engine, seeded };
};

describe('Message body repair', () => {
  it('re-parses corrupted bodies from the server and leaves clean messages alone', async () => {
    const { engine, seeded } = await seedMail(['broken', 'clean']);
    corrupt(engine, 'broken');
    const clean = storedMessage(engine, 'clean');
    await queueRepair(engine, seeded);

    await sync(engine, seeded);

    const repaired = storedMessage(engine, 'broken');
    expect(repaired.textBody).toBe(CORRECT_BODY);
    expect(repaired.snippet).toBe(CORRECT_BODY);
    expect(present(engine.db.tables.threads.get(repaired.threadId)).snippet).toBe(CORRECT_BODY);
    expect(storedMessage(engine, 'clean')).toEqual(clean);
    expect(seeded.server.fetchedMessages).toEqual([{ path: 'INBOX', uid: repaired.uid }]);
    expect(engine.events.ofType('message.upserted').map((event) => event.data.message.id)).toEqual([
      repaired.id,
    ]);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });

  it('skips a message whose refetch fails and repairs the others', async () => {
    const { engine, seeded } = await seedMail(['first', 'second']);
    corrupt(engine, 'first');
    corrupt(engine, 'second');
    await queueRepair(engine, seeded);
    seeded.server.failFetchUid = storedMessage(engine, 'first').uid;

    await sync(engine, seeded);
    await sync(engine, seeded);

    expect(storedMessage(engine, 'first').textBody).toBe(CORRUPTED_BODY);
    expect(storedMessage(engine, 'second').textBody).toBe(CORRECT_BODY);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });

  it('runs only once, so later corruption is not refetched again', async () => {
    const { engine, seeded } = await seedMail(['broken']);
    corrupt(engine, 'broken');
    await queueRepair(engine, seeded);
    await sync(engine, seeded);
    expect(storedMessage(engine, 'broken').textBody).toBe(CORRECT_BODY);
    corrupt(engine, 'broken');
    seeded.server.fetchedMessages.length = 0;

    await sync(engine, seeded);

    expect(seeded.server.fetchedMessages).toEqual([]);
    expect(storedMessage(engine, 'broken').textBody).toBe(CORRUPTED_BODY);
  });

  it('queues the thread refresh before it rewrites the body', async () => {
    const watchers: RefreshWatchingBodyRepairs[] = [];
    const { engine, seeded } = await seedMail(['broken'], {
      messageBodyRepairs: (db) => {
        const watcher = new RefreshWatchingBodyRepairs(db);
        watchers.push(watcher);
        return watcher;
      },
    });
    corrupt(engine, 'broken');
    await queueRepair(engine, seeded);

    await sync(engine, seeded);

    expect(watchers.map((watcher) => watcher.refreshQueuedAtUpdate)).toEqual([[true]]);
    expect(storedMessage(engine, 'broken').textBody).toBe(CORRECT_BODY);
  });

  it('skips a stored message without a Message-ID', async () => {
    const { engine, seeded } = await seedMail(['anonymous']);
    corrupt(engine, 'anonymous');
    const stored = storedMessage(engine, 'anonymous');
    engine.db.tables.messages.set(stored.id, { ...stored, messageIdHeader: null });
    await queueRepair(engine, seeded);

    await sync(engine, seeded);

    expect(seeded.server.fetchedMessages).toEqual([]);
    expect(engine.db.tables.messages.get(stored.id)?.textBody).toBe(CORRUPTED_BODY);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });

  it('skips a mailbox whose UIDVALIDITY changed since it was synced', async () => {
    const engine = createTestEngine();
    const seeded = await seedAccount(engine);
    seeded.server.addMailbox('Projekty', 'custom');
    deliverMail(seeded.server, 'Projekty', { id: 'folder', body: CORRECT_BODY });
    await sync(engine, seeded);
    corrupt(engine, 'folder');
    seeded.server.mailbox('Projekty').subscribed = false;
    seeded.server.resetUidValidity('Projekty');
    await queueRepair(engine, seeded, 'Projekty');

    await sync(engine, seeded);

    expect(seeded.server.fetchedMessages).toEqual([]);
    expect(storedMessage(engine, 'folder').textBody).toBe(CORRUPTED_BODY);
    expect(engine.db.tables.pendingWork.size).toBe(0);
  });
});
