import { LOCAL_USER_ID } from '../../src';
import { MERGE_THREAD, type MergeAccount } from './merge-seed';
import type { TestStore } from './test-database';

export const AT = '2026-11-24T08:00:00.000Z';

export interface AiJobSpec {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly input: object;
  readonly output?: object | null;
  readonly source?: string | null;
}

export interface PendingSpec {
  readonly kind: string;
  readonly ref: string;
  readonly payload: object;
  readonly createdAt?: string;
  readonly revision?: string;
}

const run = (store: TestStore, statement: string, ...params: unknown[]): void => {
  store.database.sqlite.prepare(statement).run(...params);
};

export const insertAutomation = (store: TestStore, account: MergeAccount, id: string): void => {
  run(
    store,
    `insert into automations (id, user_id, account_id, name, enabled, position, conditions, ai, actions)
     values (?, ?, ?, 'Faktúry', 1, 0, '[]', '{}', '[]')`,
    id,
    LOCAL_USER_ID,
    account.seeded.account.id,
  );
};

export const insertRun = (store: TestStore, automationId: string, messageId: string): void => {
  run(
    store,
    'insert into automation_runs (automation_id, message_id, user_id, created_at) values (?, ?, ?, ?)',
    automationId,
    messageId,
    LOCAL_USER_ID,
    AT,
  );
};

export const insertAiJob = (store: TestStore, job: AiJobSpec): void => {
  run(
    store,
    `insert into ai_jobs (id, user_id, kind, status, runner_location, runner, input, output, created_at, updated_at, thread_id, source_message_id)
     values (?, ?, ?, ?, 'local', 'claude', ?, ?, ?, ?, ?, ?)`,
    job.id,
    LOCAL_USER_ID,
    job.kind,
    job.status,
    JSON.stringify(job.input),
    job.output === undefined || job.output === null ? null : JSON.stringify(job.output),
    AT,
    AT,
    MERGE_THREAD,
    job.source ?? null,
  );
};

export const insertAiResult = (
  store: TestStore,
  id: string,
  source: string | null,
  output: object,
): void => {
  run(
    store,
    `insert into ai_results (id, user_id, thread_id, source_message_id, kind, runner, output, created_at, created_ts)
     values (?, ?, ?, ?, 'automationDraft', 'claude', ?, ?, 0)`,
    id,
    LOCAL_USER_ID,
    MERGE_THREAD,
    source,
    JSON.stringify(output),
    AT,
  );
};

export const insertActivity = (
  store: TestStore,
  account: MergeAccount,
  spec: { readonly id: string; readonly automationId: string; readonly messageId: string },
  actions: readonly object[],
): void => {
  run(
    store,
    `insert into automation_activity (id, user_id, automation_id, account_id, thread_id, message_id, source, sender, subject, actions, failed_count, created_at, created_ts)
     values (?, ?, ?, ?, ?, ?, 'live', null, 'Faktúra', ?, 0, ?, 0)`,
    spec.id,
    LOCAL_USER_ID,
    spec.automationId,
    account.seeded.account.id,
    MERGE_THREAD,
    spec.messageId,
    JSON.stringify(actions),
    AT,
  );
};

export const insertReplyDraft = (
  store: TestStore,
  account: MergeAccount,
  id: string,
  messageId: string,
): void => {
  run(
    store,
    `insert into drafts (id, user_id, account_id, "to", cc, bcc, subject, body, in_reply_to_thread_id, in_reply_to_message_id, created_at, updated_at, updated_ts)
     values (?, ?, ?, '[]', '[]', '[]', 'Re: Faktúra', 'Ďakujem', ?, ?, ?, ?, 0)`,
    id,
    LOCAL_USER_ID,
    account.seeded.account.id,
    MERGE_THREAD,
    messageId,
    AT,
    AT,
  );
};

export const insertCalendarEvent = (store: TestStore, id: string, messageId: string): void => {
  run(
    store,
    `insert into calendar_events (id, user_id, series_key, uid, recurrence_key, sequence, status, summary, attendees, all_day, starts_at, starts_ts, ends_at, recurring, ics, message_id, thread_id, created_at, updated_at)
     values (?, ?, ?, ?, '', 0, 'confirmed', 'Porada', '[]', 0, ?, 0, ?, 0, '', ?, ?, ?, ?)`,
    id,
    LOCAL_USER_ID,
    `series-${id}`,
    `uid-${id}`,
    AT,
    AT,
    messageId,
    MERGE_THREAD,
    AT,
    AT,
  );
};

export const insertPending = (store: TestStore, account: MergeAccount, spec: PendingSpec): void => {
  run(
    store,
    'insert into pending_work (account_id, kind, ref, payload, revision, created_at) values (?, ?, ?, ?, ?, ?)',
    account.seeded.account.id,
    spec.kind,
    spec.ref,
    JSON.stringify(spec.payload),
    spec.revision ?? `rev-${spec.ref}`,
    spec.createdAt ?? AT,
  );
};
