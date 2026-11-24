import { AccountIdSchema, type Mailbox, MailboxIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type SqliteDatabase } from '../src';
import { buildMailbox } from './support/fixtures';
import { insertLegacyAccount } from './support/legacy-account';
import { insertLegacyMailbox } from './support/legacy-mailbox';
import { insertLegacyMessage } from './support/legacy-message';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory, type TempDirectory } from './support/test-database';

const ROLES = ['inbox', 'archive', 'sent', 'drafts', 'spam', 'custom'] as const;

interface GateRow {
  readonly id: string;
  readonly jira: string | null;
  readonly invite: string | null;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const place = (database: SqliteDatabase, id: string, mailbox: Mailbox, uid: number): void => {
  database.sqlite
    .prepare('insert into message_placements (message_id, mailbox_id, uid) values (?, ?, ?)')
    .run(id, mailbox.id, uid);
};

const ftsHits = (database: SqliteDatabase): number =>
  database.sqlite
    .prepare<
      [],
      { hits: number }
    >("select count(*) as hits from messages_fts where messages_fts match 'Vianoce'")
    .get()?.hits ?? 0;

const gatesOf = (database: SqliteDatabase): Record<string, { jira: boolean; invite: boolean }> =>
  Object.fromEntries(
    database.sqlite
      .prepare<[], GateRow>(
        'select id, jira_effects_at as jira, invite_effects_at as invite from messages order by id',
      )
      .all()
      .map((row) => [row.id, { jira: row.jira !== null, invite: row.invite !== null }]),
  );

describe('message effect gates migration', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('closes each gate only on rows whose placements accept that effect', () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0038_message_effect_gates', directory.path),
    });
    const account = insertLegacyAccount(database, { id: AccountIdSchema.parse('acc-old') });
    const boxes = Object.fromEntries(
      ROLES.map((role) => {
        const mailbox = buildMailbox({
          id: MailboxIdSchema.parse(`mbx-${role}`),
          accountId: account.id,
          name: role,
          path: role,
          role,
        });
        insertLegacyMailbox(database, mailbox);
        return [role, mailbox];
      }),
    ) as Record<(typeof ROLES)[number], Mailbox>;
    const legacy = (id: string, mailbox: Mailbox, uid: number): void => {
      insertLegacyMessage(database, {
        id,
        userId: account.userId,
        mailbox,
        uid,
        textBody: `Vianoce ${id}`,
      });
      place(database, id, mailbox, uid);
    };
    ROLES.forEach((role, index) => {
      legacy(`msg-${role}`, boxes[role], index + 1);
    });
    legacy('msg-spam-inbox', boxes.spam, 20);
    place(database, 'msg-spam-inbox', boxes.inbox, 20);
    legacy('msg-header-only', boxes.inbox, 21);
    database.sqlite.exec(`update messages set body_state = 'remote' where id = 'msg-header-only'`);
    const hits = ftsHits(database);

    migrate(database);

    expect(gatesOf(database)).toEqual({
      'msg-archive': { jira: true, invite: true },
      'msg-custom': { jira: false, invite: false },
      'msg-drafts': { jira: true, invite: false },
      'msg-header-only': { jira: true, invite: true },
      'msg-inbox': { jira: true, invite: true },
      'msg-sent': { jira: true, invite: true },
      'msg-spam': { jira: false, invite: false },
      'msg-spam-inbox': { jira: true, invite: true },
    });
    const stamp = database.sqlite
      .prepare<
        [],
        { jira: string }
      >("select jira_effects_at as jira from messages where id = 'msg-inbox'")
      .get();
    expect(stamp?.jira).toMatch(ISO_TIMESTAMP);
    expect(ftsHits(database)).toBe(hits);
    expect(
      database.sqlite
        .prepare<
          [],
          { sql: string }
        >("select sql from sqlite_master where name = 'messages_mailbox_uid_unique'")
        .get()?.sql,
    ).toContain('WHERE uid > 0');
    expect(hits).toBe(ROLES.length + 2);
    database.close();
  });
});
