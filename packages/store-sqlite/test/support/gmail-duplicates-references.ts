import { LOCAL_USER_ID } from '../../src';
import type { MergeAccount } from './merge-seed';
import type { TestStore } from './test-database';

export interface ReferenceWriter {
  write(messageId: string, threadId: string, row: number): void;
}

const AT = '2026-11-20T08:00:00.000Z';
const AUTOMATION_ID = 'aut-perf';

const STATEMENTS = {
  run: 'insert into automation_runs (automation_id, message_id, user_id, created_at) values (@automation, @id, @user, @at)',
  job: `insert into ai_jobs (id, user_id, kind, status, runner_location, runner, input, output, created_at, updated_at, thread_id, source_message_id) values ('job-' || @id, @user, 'oneLiner', 'done', 'local', 'claude', json_object('kind', 'oneLiner', 'threadId', @thread, 'sourceMessageId', @id), null, @at, @at, @thread, @id)`,
  result: `insert into ai_results (id, user_id, thread_id, source_message_id, kind, runner, output, created_at, created_ts) values ('air-' || @id, @user, @thread, @id, 'automationDraft', 'claude', json_object('kind', 'automationDraft', 'threadId', @thread, 'messageId', @id, 'body', 'Ďakujem'), @at, 0)`,
  activity: `insert into automation_activity (id, user_id, automation_id, account_id, thread_id, message_id, source, sender, subject, actions, failed_count, created_at, created_ts) values ('act-' || @id, @user, @automation, @account, @thread, @id, 'live', null, 'Faktúra', json_array(json_object('action', json_object('type', 'archive'), 'outcome', 'ok', 'changed', json_array(@id), 'origins', json_array(json_object('messageId', @id, 'revision', 'r1')))), 0, @at, 0)`,
  draft: `insert into drafts (id, user_id, account_id, "to", cc, bcc, subject, body, in_reply_to_thread_id, in_reply_to_message_id, created_at, updated_at, updated_ts) values ('drf-' || @id, @user, @account, '[]', '[]', '[]', 'Re: Faktúra', 'Ďakujem', @thread, @id, @at, @at, 0)`,
  event: `insert into calendar_events (id, user_id, series_key, uid, recurrence_key, sequence, status, summary, attendees, all_day, starts_at, starts_ts, ends_at, recurring, ics, message_id, thread_id, created_at, updated_at) values ('evt-' || @id, @user, 'series-' || @id, 'uid-' || @id, '', 0, 'confirmed', 'Porada', '[]', 0, @at, 0, @at, 0, '', @id, @thread, @at, @at)`,
  op: `insert into pending_work (account_id, kind, ref, payload, revision, created_at) values (@account, 'provider-op', @id || ':flag:seen', json_object('messageId', @id, 'change', json_object('kind', 'flag', 'flag', 'seen', 'value', json('true'))), 'rev-' || @id, @at)`,
  effects: `insert into pending_work (account_id, kind, ref, payload, revision, created_at) values (@account, 'message-effects', @id, json_object('messageId', @id, 'threadId', @thread, 'publish', json('false'), 'arrival', json('true'), 'headers', json_array()), 'rev-' || @id, @at)`,
} as const;

type ReferenceKind = keyof typeof STATEMENTS;

const RATES: readonly (readonly [ReferenceKind, number, number])[] = [
  ['run', 20, 3],
  ['job', 50, 7],
  ['result', 50, 9],
  ['activity', 100, 11],
  ['draft', 500, 13],
  ['event', 200, 17],
  ['op', 100, 19],
  ['effects', 200, 23],
];

export const referenceWriter = (store: TestStore, account: MergeAccount): ReferenceWriter => {
  const { sqlite } = store.database;
  sqlite
    .prepare(
      `insert into automations (id, user_id, account_id, name, enabled, position, conditions, ai, actions) values (?, ?, ?, 'Faktúry', 1, 0, '[]', '{}', '[]')`,
    )
    .run(AUTOMATION_ID, LOCAL_USER_ID, account.seeded.account.id);
  const prepared = RATES.map(([kind, every, offset]) => ({
    statement: sqlite.prepare(STATEMENTS[kind]),
    every,
    offset,
  }));
  return {
    write: (messageId, threadId, row) => {
      prepared
        .filter(({ every, offset }) => row % every === offset)
        .forEach(({ statement }) => {
          statement.run({
            id: messageId,
            thread: threadId,
            user: LOCAL_USER_ID,
            account: account.seeded.account.id,
            automation: AUTOMATION_ID,
            at: AT,
          });
        });
    },
  };
};
