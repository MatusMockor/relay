import {
  type AccountId,
  type LabelId,
  LabelIdSchema,
  type MailboxId,
  type UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../../src/persistence/database/database';

export interface DuplicateFixture {
  readonly size: number;
  readonly userId: UserId;
  readonly accountId: AccountId;
  readonly inbox: MailboxId;
  readonly allMail: MailboxId;
  readonly sent: MailboxId;
  readonly work: MailboxId;
}

export const CONFLICT_UID_OFFSET = 10_000_000;
export const LABEL_COUNT = 20;

export const emailIdOfUid = (uid: number): string =>
  `gm-${String(uid > CONFLICT_UID_OFFSET ? uid - CONFLICT_UID_OFFSET : uid).padStart(9, '0')}`;

export const labelIdOf = (fixture: DuplicateFixture, index: number): LabelId =>
  LabelIdSchema.parse(`${fixture.accountId}-label-${String(index)}`);

const seedParagraphs = async (db: DbExecutor): Promise<void> => {
  await db.execute(
    sql`create table if not exists perf_paragraphs (p int primary key, body text not null)`,
  );
  await db.execute(sql`truncate perf_paragraphs`);
  await db.execute(sql`insert into perf_paragraphs (p, body)
    select p, string_agg(substr(md5((p * 31 + w)::text), 1, 3 + ((p + w) % 6)), ' ' order by w)
    from generate_series(0, 999) p, generate_series(1, 30) w group by p`);
};

const seedMessages = async (db: DbExecutor, fixture: DuplicateFixture): Promise<void> => {
  const { size, userId, accountId, inbox, allMail, sent, work } = fixture;
  await db.execute(sql`with copies as (
      select i, 'a' as copy, ${allMail}::text as mailbox_id, i as uid from generate_series(1, ${size}::int) i
      union all select i, 'i', ${inbox}, i from generate_series(4, ${size}::int, 4) i
      union all select i, 's', ${sent}, i from generate_series(1, ${size}::int, 10) i
      union all select i, 'w', ${work}, i from generate_series(5, ${size}::int, 10) i
      union all select i, 'c', ${work}, ${CONFLICT_UID_OFFSET} + i from generate_series(15, ${size}::int, 1000) i
    ),
    shaped as (
      select copies.*, copy <> 'a' and (i / 10) % 10 < 3 as header_only,
        (i - 1) * 2 / 5 + 1 as thread_no,
        (copy = 'i' and i % 1000 = 4) or (copy = 's' and i % 1000 = 11) as spanning,
        (copy = 'i' and i % 200 = 0) or (copy = 's' and i % 200 = 1) or (copy = 'w' and i % 200 = 5) as unresolved
      from copies
    )
    insert into messages (id, user_id, account_id, mailbox_id, thread_id, uid, "references",
      to_addresses, cc_addresses, bcc_addresses, reply_to_addresses, subject, normalized_subject,
      date, snippet, text_body, html_body, seen, flagged, answered, attachments, headers, email_id,
      message_id_header, jira_effects_at, invite_effects_at)
    select md5(${accountId} || '-' || copy || '-' || i)::uuid::text, ${userId}, ${accountId}, mailbox_id,
      case when spanning then ${accountId} || '-tx-' || i else ${accountId} || '-t-' || thread_no end,
      uid, '{}', '[{"name":null,"email":"jan@relay.test"}]', '[]', '[]', '[]',
      'Projekt ' || thread_no, 'projekt ' || thread_no,
      timestamptz '2025-01-01 00:00:00Z' + i * interval '5 minutes',
      left(text.body, 140),
      case when header_only then null else text.body end,
      case when header_only then null else html.body end,
      i % 3 = 0, false, false, '[]', '{}',
      case when unresolved then null else 'gm-' || lpad(i::text, 9, '0') end,
      '<' || i || '@relay.test>', now(), now()
    from shaped
    cross join lateral (
      select string_agg(body, ' ' order by k) as body from generate_series(0, 9) k
      inner join perf_paragraphs on p = (i * 37 + k * 101) % 1000
    ) text
    cross join lateral (
      select '<p>' || string_agg(body, '</p><p>' order by k) || '</p>' as body
      from generate_series(0, 19) k inner join perf_paragraphs on p = (i * 53 + k * 71) % 1000
    ) html`);
  await db.execute(sql`insert into message_placements (message_id, mailbox_id, uid)
    select id, mailbox_id, uid from messages where account_id = ${accountId}`);
};

const seedLabels = async (db: DbExecutor, fixture: DuplicateFixture): Promise<void> => {
  const { userId, accountId } = fixture;
  await db.execute(sql`insert into labels (id, user_id, account_id, name, kind, remote_name, name_key)
    select ${accountId} || '-label-' || k, ${userId}, ${accountId}, 'Stitok ' || k, 'gmail',
      'Stitok ' || k, 'stitok ' || k
    from generate_series(0, ${LABEL_COUNT - 1}::int) k`);
  await db.execute(sql`insert into message_labels (message_id, label_id, user_id)
    select m.id, ${accountId} || '-label-' || ((abs(hashtext(m.id)) + k) % ${LABEL_COUNT}), ${userId}
    from messages m inner join generate_series(1, 3) k on k <= 1 + abs(hashtext(m.id)) % 3
    where m.account_id = ${accountId}`);
};

const seedThreads = async (db: DbExecutor, fixture: DuplicateFixture): Promise<void> => {
  const { userId, accountId, inbox } = fixture;
  await db.execute(sql`insert into threads (id, user_id, account_id, subject, participants,
      last_message_at, message_count, unread, snippet, state)
    select thread_id, ${userId}, ${accountId}, min(subject), '[{"name":"Eva","email":"eva@firma.sk"}]',
      max(date), count(*), bool_or(not seen), min(snippet),
      case when bool_or(mailbox_id = ${inbox}) then 'inbox' else 'done' end
    from messages where account_id = ${accountId} group by thread_id`);
};

export const seedGmailDuplicates = async (
  db: DbExecutor,
  fixture: DuplicateFixture,
): Promise<void> => {
  await seedParagraphs(db);
  await seedMessages(db, fixture);
  await seedLabels(db, fixture);
  await seedThreads(db, fixture);
};
