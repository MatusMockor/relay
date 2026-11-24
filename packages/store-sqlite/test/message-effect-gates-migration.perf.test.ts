import { join } from 'node:path';
import { AccountIdSchema, type Mailbox, MailboxIdSchema } from '@relay/shared/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type SqliteDatabase } from '../src';
import { buildMailbox } from './support/fixtures';
import { insertLegacyAccount } from './support/legacy-account';
import { insertLegacyMailbox } from './support/legacy-mailbox';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory } from './support/test-database';

const MESSAGE_COUNT = 100_000;
const BUDGET_MS = 5_000;
const ROLES = ['inbox', 'archive', 'archive', 'sent', 'inbox', 'spam', 'custom', 'drafts'] as const;
const BODY = 'Dobrý deň, posielam faktúru, zmluvu a rozpočet na projekt. '.repeat(40);

const LEGACY_SQL = `insert into messages (
  id, user_id, thread_id, account_id, mailbox_id, uid, message_id_header, "references", "to",
  cc, bcc, reply_to, subject, date, date_ts, snippet, text_body, seen, flagged, answered,
  attachments, headers
) values (?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', 'Faktúra', '2024-05-01T08:00:00.000Z',
  1714550400000, 'Faktúra', ?, 0, 0, 0, '[]', '[]')`;

const seedLegacyRows = (
  database: SqliteDatabase,
  userId: string,
  mailboxes: readonly Mailbox[],
): void => {
  const insert = database.sqlite.prepare(LEGACY_SQL);
  const place = database.sqlite.prepare(
    'insert into message_placements (message_id, mailbox_id, uid) values (?, ?, ?)',
  );
  const seedOne = (mailbox: Mailbox, index: number): void => {
    const id = `msg-${String(index)}`;
    const uid = index + 1;
    const body = `${BODY} ${String(index)}`;
    insert.run(id, userId, `thr-${id}`, mailbox.accountId, mailbox.id, uid, `<${id}@a.sk>`, body);
    place.run(id, mailbox.id, uid);
  };
  database.sqlite.transaction(() => {
    Array.from({ length: MESSAGE_COUNT }, (_, index) => index).forEach((index) => {
      const mailbox = mailboxes[index % mailboxes.length];
      expect(mailbox).toBeDefined();
      if (mailbox !== undefined) {
        seedOne(mailbox, index);
      }
    });
  })();
};

describe.runIf(process.env.RELAY_PERF === '1')('message effect gates migration performance', () => {
  const directory = createTempDirectory();

  afterAll(() => {
    directory.remove();
  });

  it('backfills the gates of 100k messages within the budget', () => {
    const database = openDatabase(join(directory.path, 'gates.db'));
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0038_message_effect_gates', directory.path),
    });
    const account = insertLegacyAccount(database, { id: AccountIdSchema.parse('acc-perf') });
    const mailboxes = ROLES.map((role, index) =>
      buildMailbox({
        id: MailboxIdSchema.parse(`mbx-${String(index)}`),
        accountId: account.id,
        name: `${role}-${String(index)}`,
        path: `${role}-${String(index)}`,
        role,
      }),
    );
    mailboxes.forEach((mailbox) => {
      insertLegacyMailbox(database, mailbox);
    });
    seedLegacyRows(database, account.userId, mailboxes);

    const started = performance.now();
    migrate(database);
    const elapsed = performance.now() - started;

    const gated = database.sqlite
      .prepare<
        [],
        { count: number }
      >('select count(*) as count from messages where jira_effects_at is not null')
      .get()?.count;
    process.stdout.write(
      `effect gates backfill of ${String(MESSAGE_COUNT)} messages: ${elapsed.toFixed(0)} ms\n`,
    );
    expect(gated).toBe((MESSAGE_COUNT * 6) / 8);
    expect(elapsed).toBeLessThan(BUDGET_MS);
    database.close();
  });
});
