import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../../src/persistence/database/database';
import type { DuplicateFixture } from './gmail-duplicates-seed';

const rowsWhere = (fixture: DuplicateFixture, modulo: number, from: number, to: number) =>
  sql`m.account_id = ${fixture.accountId}
    and abs(hashtext(m.id)) % ${modulo} >= ${from} and abs(hashtext(m.id)) % ${modulo} < ${to}`;

const seedAutomationRows = async (db: DbExecutor, fixture: DuplicateFixture): Promise<void> => {
  const { userId, accountId } = fixture;
  const automation = `${accountId}-automation`;
  await db.execute(sql`insert into automations
      (id, user_id, account_id, name, enabled, position, conditions, ai, actions)
    values (${automation}, ${userId}, ${accountId}, 'Pravidlo', true, 0, '[]', '{}', '[]')`);
  await db.execute(sql`insert into automation_runs (automation_id, message_id, user_id, created_at)
    select ${automation}, m.id, ${userId}, now() from messages m where ${rowsWhere(fixture, 100, 0, 5)}`);
  await db.execute(sql`insert into automation_activity (id, user_id, automation_id, account_id,
      thread_id, message_id, source, sender, subject, actions, failed_count, created_at)
    select md5('activity-' || m.id)::uuid::text, ${userId}, ${automation}, ${accountId}, m.thread_id,
      m.id, 'live', null, m.subject,
      jsonb_build_array(jsonb_build_object('action', jsonb_build_object('type', 'archive'),
        'outcome', 'ok', 'changed', jsonb_build_array(m.id), 'labelled', '[]'::jsonb,
        'origins', jsonb_build_array(jsonb_build_object('messageId', m.id, 'revision', 'r1')),
        'previousState', null, 'reminder', null, 'undo', null, 'reason', null)),
      0, now()
    from messages m where ${rowsWhere(fixture, 100, 9, 10)}`);
};

const seedAiRows = async (db: DbExecutor, fixture: DuplicateFixture): Promise<void> => {
  const { userId } = fixture;
  await db.execute(sql`insert into ai_jobs (id, user_id, kind, status, runner_location, runner,
      input, output, created_at, updated_at, thread_id, source_message_id)
    select md5('job-' || m.id)::uuid::text, ${userId}, 'oneLiner',
      case when abs(hashtext(m.id)) % 10 = 0 then 'queued' else 'done' end, 'server', 'claude',
      jsonb_build_object('kind', 'oneLiner', 'threadId', m.thread_id, 'sourceMessageId', m.id),
      jsonb_build_object('kind', 'oneLiner', 'text', 'Zhrnutie'), now(), now(), m.thread_id, m.id
    from messages m where ${rowsWhere(fixture, 100, 5, 7)}`);
  await db.execute(sql`insert into ai_results
      (id, user_id, thread_id, source_message_id, kind, runner, output, created_at)
    select md5('result-' || m.id)::uuid::text, ${userId}, m.thread_id, m.id, 'automationDraft',
      'claude', jsonb_build_object('kind', 'automationDraft', 'threadId', m.thread_id,
        'messageId', m.id, 'body', 'Navrh'), now()
    from messages m where ${rowsWhere(fixture, 100, 7, 9)}`);
};

const seedMailRows = async (db: DbExecutor, fixture: DuplicateFixture): Promise<void> => {
  const { userId, accountId } = fixture;
  await db.execute(sql`insert into drafts (id, user_id, account_id, to_addresses, cc_addresses,
      bcc_addresses, subject, body, in_reply_to_thread_id, in_reply_to_message_id, created_at, updated_at)
    select md5('draft-' || m.id)::uuid::text, ${userId}, ${accountId}, '[]', '[]', '[]',
      'Re: ' || m.subject, 'Dakujem', m.thread_id, m.id, now(), now()
    from messages m where ${rowsWhere(fixture, 1000, 100, 102)}`);
  await db.execute(sql`insert into calendar_events (id, user_id, account_id, series_key, uid,
      recurrence_key, sequence, status, summary, attendees, all_day, starts_at, ends_at, recurring,
      ics, message_id, thread_id, created_at, updated_at)
    select md5('event-' || m.id)::uuid::text, ${userId}, ${accountId}, 'series-' || m.id, m.id, '',
      0, 'confirmed', 'Porada', '[]', false, now(), now(), false, 'BEGIN:VCALENDAR', m.id,
      m.thread_id, now(), now()
    from messages m where ${rowsWhere(fixture, 1000, 102, 107)}`);
  await db.execute(sql`insert into pending_work (account_id, kind, ref, payload, revision, created_at)
    select ${accountId}, 'provider-op', m.id || ':flag:seen',
      jsonb_build_object('messageId', m.id,
        'change', jsonb_build_object('kind', 'flag', 'flag', 'seen', 'value', true)),
      gen_random_uuid()::text, now()
    from messages m where ${rowsWhere(fixture, 1000, 107, 117)}`);
  await db.execute(sql`insert into pending_work (account_id, kind, ref, payload, revision, created_at)
    select ${accountId}, 'message-effects', m.id,
      jsonb_build_object('messageId', m.id, 'threadId', m.thread_id, 'publish', false,
        'arrival', true, 'headers', '[]'::jsonb),
      gen_random_uuid()::text, now()
    from messages m where ${rowsWhere(fixture, 1000, 117, 122)}`);
};

export const seedDuplicateReferences = async (
  db: DbExecutor,
  fixture: DuplicateFixture,
): Promise<void> => {
  await seedAutomationRows(db, fixture);
  await seedAiRows(db, fixture);
  await seedMailRows(db, fixture);
  await db.execute(sql`analyze`);
};
