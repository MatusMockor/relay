import type { BodyRepairWork } from '@relay/engine';
import { LabelIdSchema, type Mailbox } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSqliteMessageBodyRepairs,
  createSqliteRepositories,
  migrate,
  openDatabase,
  type SqliteDatabase,
} from '../src';
import { buildMessage, messageId, NO_HEADERS, threadId } from './support/fixtures';
import { insertLegacyMessage } from './support/legacy-message';
import { writeMigrationsBefore } from './support/partial-migrations';
import { seedLegacyAccount } from './support/legacy-account';
import { seedAccount } from './support/seed';
import { createTempDirectory, createTestStore, type TempDirectory } from './support/test-database';

const CORRUPTED = 'Dobr\uFFFD de\uFFFD, posielam fakt\uFFFDru.';
const REPAIRED = 'Dobrý deň, posielam faktúru.';

type Repositories = ReturnType<typeof createSqliteRepositories>;

const storeMessage = (
  repositories: Repositories,
  mailbox: Mailbox,
  id: string,
  uid: number,
  body: { textBody?: string | null; htmlBody?: string | null; snippet?: string },
) =>
  repositories.messages.upsert(
    buildMessage({
      id: messageId(id),
      threadId: threadId(`thr-${id}`),
      accountId: mailbox.accountId,
      mailboxId: mailbox.id,
      uid,
      messageIdHeader: `<${id}@klient.sk>`,
      ...body,
    }),
    NO_HEADERS,
  );

const ftsMatches = (database: SqliteDatabase, term: string): number =>
  database.sqlite
    .prepare<
      [string],
      { count: number }
    >('select count(*) as count from messages_fts where messages_fts match ?')
    .get(term)?.count ?? 0;

describe('message body repair storage', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('lists messages with replacement characters in any body field after a UID in UID order', async () => {
    const store = createTestStore();
    const { inbox, sent } = await seedAccount(store.repositories);
    await storeMessage(store.repositories, inbox, 'text', 1, { textBody: CORRUPTED });
    await storeMessage(store.repositories, inbox, 'clean', 2, {});
    await storeMessage(store.repositories, inbox, 'html', 3, { htmlBody: `<p>${CORRUPTED}</p>` });
    await storeMessage(store.repositories, inbox, 'snippet', 4, { snippet: CORRUPTED });
    await storeMessage(store.repositories, sent, 'sent', 5, { textBody: CORRUPTED });
    const bodies = createSqliteMessageBodyRepairs(store.database);

    const first = await bodies.listAfter(inbox.id, 0, 2);
    const rest = await bodies.listAfter(inbox.id, 3, 10);

    expect(first).toEqual([
      { messageId: 'text', threadId: 'thr-text', uid: 1, messageIdHeader: '<text@klient.sk>' },
      { messageId: 'html', threadId: 'thr-html', uid: 3, messageIdHeader: '<html@klient.sk>' },
    ]);
    expect(rest.map((candidate) => candidate.messageId)).toEqual(['snippet']);
    store.database.close();
  });

  it('updates only the body fields and refreshes the full-text index', async () => {
    const store = createTestStore();
    const { account, inbox } = await seedAccount(store.repositories);
    const label = LabelIdSchema.parse('lbl-faktury');
    await store.repositories.labels.upsert({
      id: label,
      accountId: account.id,
      name: 'Faktúry',
      color: null,
      kind: 'keyword',
      remoteName: 'Faktury',
    });
    const stored = await storeMessage(store.repositories, inbox, 'broken', 1, {
      textBody: CORRUPTED,
      snippet: CORRUPTED,
    });
    await store.repositories.messages.updateFlags(stored.id, {
      seen: true,
      flagged: true,
      answered: false,
    });
    await store.repositories.messages.addLabel(stored.id, label);
    const bodies = createSqliteMessageBodyRepairs(store.database);
    expect(ftsMatches(store.database, 'dobry')).toBe(0);

    await bodies.updateBody(stored.id, { textBody: REPAIRED, htmlBody: null, snippet: REPAIRED });

    const repaired = await store.repositories.messages.findById(account.userId, stored.id);
    expect(repaired).toMatchObject({
      textBody: REPAIRED,
      htmlBody: null,
      snippet: REPAIRED,
      threadId: 'thr-broken',
      flags: { seen: true, flagged: true, answered: false },
      labelIds: [label],
    });
    expect(ftsMatches(store.database, 'dobry')).toBe(1);
    expect(await bodies.listAfter(inbox.id, 0, 10)).toEqual([]);
    store.database.close();
  });

  it('queues one repair per mailbox that holds corrupted mail when migrating', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0027_message_body_repair', directory.path),
    });
    const repositories = createSqliteRepositories(database);
    const { account, inbox, sent } = await seedLegacyAccount(database);
    insertLegacyMessage(database, {
      id: 'broken',
      userId: account.userId,
      mailbox: inbox,
      uid: 1,
      textBody: CORRUPTED,
    });
    insertLegacyMessage(database, { id: 'clean', userId: account.userId, mailbox: sent, uid: 1 });

    migrate(database);

    const work = await repositories.pendingWork.list(account.id, 'body-repair');
    const expected: BodyRepairWork[] = [{ mailboxId: inbox.id, afterUid: 0 }];
    expect(work.map((entry) => entry.payload)).toEqual(expected);
    expect(work.map((entry) => entry.ref)).toEqual([inbox.id]);
    database.close();
  });

  it('never queues the repair again once the migration has run', async () => {
    const store = createTestStore();
    const { account, inbox } = await seedAccount(store.repositories);
    await storeMessage(store.repositories, inbox, 'broken', 1, { textBody: CORRUPTED });

    migrate(store.database);

    expect(await store.repositories.pendingWork.list(account.id, 'body-repair')).toEqual([]);
    store.database.close();
  });
});
