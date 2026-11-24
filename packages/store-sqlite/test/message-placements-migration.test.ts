import { AccountIdSchema, MailboxIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, migrate, openDatabase, type SqliteDatabase } from '../src';
import { buildMailbox, messageId } from './support/fixtures';
import { insertLegacyAccount } from './support/legacy-account';
import { insertLegacyMailbox } from './support/legacy-mailbox';
import { insertLegacyMessage } from './support/legacy-message';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory, type TempDirectory } from './support/test-database';

const ROLES = ['inbox', 'archive', 'sent', 'drafts', 'spam', 'custom'] as const;

const ftsHits = (database: SqliteDatabase, term: string): number =>
  database.sqlite
    .prepare<
      [string],
      { hits: number }
    >('select count(*) as hits from messages_fts where messages_fts match ?')
    .get(term)?.hits ?? 0;

describe('message placements migration', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('gives every legacy message one placement and keeps its labels and search rows', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0037_message_placements', directory.path),
    });
    const account = insertLegacyAccount(database, { id: AccountIdSchema.parse('acc-old') });
    const mailboxes = ROLES.map((role) =>
      buildMailbox({
        id: MailboxIdSchema.parse(`mbx-${role}`),
        accountId: account.id,
        name: role,
        path: role,
        role,
      }),
    );
    mailboxes.forEach((mailbox, index) => {
      insertLegacyMailbox(database, mailbox);
      insertLegacyMessage(database, {
        id: `msg-${mailbox.role}`,
        userId: account.userId,
        mailbox,
        uid: index + 1,
        textBody: `Vianoce ${mailbox.role}`,
      });
    });
    database.sqlite
      .prepare(
        `insert into labels (id, account_id, name, color, kind, remote_name) values ('lbl-old', ?, 'Faktury', null, 'keyword', 'Faktury')`,
      )
      .run(account.id);
    database.sqlite
      .prepare(`insert into message_labels (message_id, label_id) values ('msg-inbox', 'lbl-old')`)
      .run();

    migrate(database);

    const placements = database.sqlite
      .prepare('select message_id, mailbox_id, uid from message_placements order by uid')
      .all();
    expect(placements).toEqual(
      mailboxes.map((mailbox, index) => ({
        message_id: `msg-${mailbox.role}`,
        mailbox_id: mailbox.id,
        uid: index + 1,
      })),
    );
    expect(ftsHits(database, 'Vianoce')).toBe(ROLES.length);
    const stored = await createSqliteRepositories(database).messages.findById(
      account.userId,
      messageId('msg-inbox'),
    );
    expect(stored).toMatchObject({
      labelIds: ['lbl-old'],
      placements: [{ mailboxId: 'mbx-inbox', uid: 1 }],
    });
    database.close();
  });
});
