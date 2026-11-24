import type { PendingWork, PendingWorkKind, PendingWorkPayloads } from '@relay/engine';
import type { AutomationActivityAction, MessageId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { newId } from './fixtures';
import type { MergeScene } from './merge-scene';

const SEEDED_AT = '2026-11-20T08:00:00.000Z';

export interface SeededAiJob {
  readonly sourceMessageId: MessageId | null;
  readonly status: 'queued' | 'running' | 'done';
  readonly input: unknown;
  readonly output?: unknown;
}

const owner = (scene: MergeScene) => ({
  user: scene.seeded.user.id,
  account: scene.seeded.account.id,
  thread: scene.thread.id,
});

export const seedAutomation = async (scene: MergeScene): Promise<string> => {
  const id = newId('automation');
  const { user, account } = owner(scene);
  await scene.db.execute(sql`insert into automations
      (id, user_id, account_id, name, enabled, position, conditions, ai, actions)
    values (${id}, ${user}, ${account}, 'Pravidlo', true, 0, '[]', '{}', '[]')`);
  return id;
};

export const seedRun = async (scene: MergeScene, automationId: string, messageId: MessageId) => {
  await scene.db
    .execute(sql`insert into automation_runs (automation_id, message_id, user_id, created_at)
    values (${automationId}, ${messageId}, ${scene.seeded.user.id}, ${SEEDED_AT})`);
};

export const seedDraft = async (scene: MergeScene, messageId: MessageId): Promise<string> => {
  const id = newId('draft');
  const { user, account, thread } = owner(scene);
  await scene.db
    .execute(sql`insert into drafts (id, user_id, account_id, to_addresses, cc_addresses,
      bcc_addresses, subject, body, in_reply_to_thread_id, in_reply_to_message_id, created_at, updated_at)
    values (${id}, ${user}, ${account}, '[]', '[]', '[]', 'Re: Stretnutie', 'Dakujem', ${thread},
      ${messageId}, ${SEEDED_AT}, ${SEEDED_AT})`);
  return id;
};

export const seedCalendarEvent = async (scene: MergeScene, messageId: MessageId) => {
  const id = newId('calendarEvent');
  const { user, account, thread } = owner(scene);
  await scene.db.execute(sql`insert into calendar_events (id, user_id, account_id, series_key, uid,
      recurrence_key, sequence, status, summary, attendees, all_day, starts_at, ends_at, recurring,
      ics, message_id, thread_id, created_at, updated_at)
    values (${id}, ${user}, ${account}, ${id}, ${id}, '', 0, 'confirmed', 'Porada', '[]', false,
      ${SEEDED_AT}, ${SEEDED_AT}, false, 'BEGIN:VCALENDAR', ${messageId}, ${thread}, ${SEEDED_AT},
      ${SEEDED_AT})`);
  return id;
};

export const seedAiResult = async (scene: MergeScene, messageId: MessageId): Promise<string> => {
  const id = newId('aiResult');
  const { user, thread } = owner(scene);
  const output = { kind: 'automationDraft', threadId: thread, messageId, body: 'Navrh odpovede' };
  await scene.db.execute(sql`insert into ai_results
      (id, user_id, thread_id, source_message_id, kind, runner, output, created_at)
    values (${id}, ${user}, ${thread}, ${messageId}, 'automationDraft', 'claude',
      ${JSON.stringify(output)}::jsonb, ${SEEDED_AT})`);
  return id;
};

export const seedAiJob = async (scene: MergeScene, job: SeededAiJob): Promise<string> => {
  const id = newId('aiJob');
  const { user, thread } = owner(scene);
  const input = job.input as { readonly kind: string };
  const output = job.output === undefined ? null : JSON.stringify(job.output);
  await scene.db
    .execute(sql`insert into ai_jobs (id, user_id, kind, status, runner_location, runner,
      input, output, created_at, updated_at, thread_id, source_message_id)
    values (${id}, ${user}, ${input.kind}, ${job.status}, 'server', 'claude',
      ${JSON.stringify(job.input)}::jsonb, ${output}::jsonb, ${SEEDED_AT}, ${SEEDED_AT}, ${thread},
      ${job.sourceMessageId})`);
  return id;
};

export const seedActivity = async (
  scene: MergeScene,
  automationId: string,
  messageId: MessageId,
  actions: readonly Partial<AutomationActivityAction>[],
): Promise<string> => {
  const id = newId('automationActivity');
  const { user, account, thread } = owner(scene);
  const full = actions.map((action) => ({ action: { type: 'archive' }, outcome: 'ok', ...action }));
  await scene.db
    .execute(sql`insert into automation_activity (id, user_id, automation_id, account_id,
      thread_id, message_id, source, sender, subject, actions, failed_count, created_at)
    values (${id}, ${user}, ${automationId}, ${account}, ${thread}, ${messageId}, 'live', null,
      'Stretnutie', ${JSON.stringify(full)}::jsonb, 0, ${SEEDED_AT})`);
  return id;
};

export const seedPending = async <Kind extends PendingWorkKind>(
  scene: MergeScene,
  kind: Kind,
  ref: string,
  payload: PendingWorkPayloads[Kind],
  createdAt: string = SEEDED_AT,
): Promise<PendingWork<Kind>> => {
  const work: PendingWork<Kind> = {
    accountId: scene.seeded.account.id,
    kind,
    ref,
    payload,
    revision: newId('device'),
    createdAt,
  };
  await scene.db
    .execute(sql`insert into pending_work (account_id, kind, ref, payload, revision, created_at)
    values (${work.accountId}, ${kind}, ${ref}, ${JSON.stringify(payload)}::jsonb, ${work.revision},
      ${createdAt})`);
  return work;
};
