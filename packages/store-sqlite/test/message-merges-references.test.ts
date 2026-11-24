import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { messageId } from './support/fixtures';
import { expectMergeInvariants, expectNoLoserReferences } from './support/merge-invariants';
import {
  insertActivity,
  insertAiJob,
  insertAiResult,
  insertAutomation,
  insertCalendarEvent,
  insertReplyDraft,
  insertRun,
} from './support/merge-references-seed';
import {
  insertCopy,
  MERGE_THREAD,
  type MergeAccount,
  seedMergeAccount,
} from './support/merge-seed';
import { createTestStore, type TestStore } from './support/test-database';

const LOSERS = ['msg-l', 'msg-m'];

interface Row {
  readonly [column: string]: unknown;
}

describe('SqliteMessageMerges reference remapping', () => {
  let store: TestStore;
  let account: MergeAccount;

  const rows = (statement: string): Row[] =>
    store.database.sqlite.prepare<[], Row>(statement).all();

  const mergeGroup = async (emailId = 'gm-1') =>
    store.unitOfWork.run((repositories) =>
      repositories.messageMerges.merge(account.seeded.account.id, [{ emailId, size: 3 }]),
    );

  beforeEach(async () => {
    store = createTestStore();
    account = await seedMergeAccount(store);
    insertCopy(store, account, { id: 'msg-k', mailbox: account.boxes.inbox, uid: 3 });
    insertCopy(store, account, { id: 'msg-l', mailbox: account.boxes.allMail, uid: 7 });
    insertCopy(store, account, { id: 'msg-m', mailbox: account.boxes.label, uid: 8 });
    insertAutomation(store, account, 'aut-1');
    insertAutomation(store, account, 'aut-2');
  });

  afterEach(() => {
    store.database.close();
  });

  it('carries automation runs over to the keeper without duplicates', async () => {
    insertRun(store, 'aut-1', 'msg-k');
    insertRun(store, 'aut-1', 'msg-l');
    insertRun(store, 'aut-2', 'msg-m');

    await mergeGroup();

    expect(
      rows(
        'select automation_id as automation, message_id as message from automation_runs order by 1',
      ),
    ).toEqual([
      { automation: 'aut-1', message: 'msg-k' },
      { automation: 'aut-2', message: 'msg-k' },
    ]);
    expectMergeInvariants(store);
    expectNoLoserReferences(store, LOSERS);
  });

  it('re-points drafts, calendar events, AI results and activity', async () => {
    insertReplyDraft(store, account, 'drf-1', 'msg-m');
    insertCalendarEvent(store, 'evt-1', 'msg-l');
    const draft = { kind: 'automationDraft', threadId: MERGE_THREAD, body: 'Ďakujem' };
    insertAiResult(store, 'air-1', 'msg-l', { ...draft, messageId: 'msg-l' });
    insertActivity(store, account, { id: 'act-1', automationId: 'aut-1', messageId: 'msg-l' }, [
      {
        action: { type: 'archive' },
        outcome: 'ok',
        changed: ['msg-k', 'msg-l'],
        labelled: ['msg-m'],
        origins: [
          { messageId: 'msg-l', revision: 'r1' },
          { messageId: 'msg-k', revision: 'r1' },
          { messageId: 'msg-m', revision: 'r2' },
        ],
      },
    ]);

    await mergeGroup();

    expect(rows('select in_reply_to_message_id as id from drafts')).toEqual([{ id: 'msg-k' }]);
    expect(rows('select message_id as id from calendar_events')).toEqual([{ id: 'msg-k' }]);
    const [result] = rows('select source_message_id as id, output from ai_results');
    expect(result?.id).toBe('msg-k');
    expect(JSON.parse(String(result?.output))).toEqual({ ...draft, messageId: 'msg-k' });
    const [activity] = rows('select message_id as id, actions from automation_activity');
    expect(activity?.id).toBe('msg-k');
    expect(JSON.parse(String(activity?.actions))).toEqual([
      expect.objectContaining({
        changed: ['msg-k'],
        labelled: ['msg-k'],
        origins: [
          { messageId: 'msg-k', revision: 'r1' },
          { messageId: 'msg-k', revision: 'r2' },
        ],
      }),
    ]);
    expectMergeInvariants(store);
    expectNoLoserReferences(store, LOSERS);
  });

  it('keeps the loser id on an active AI job that would collide', async () => {
    const oneLiner = (source: string) => ({
      kind: 'oneLiner',
      threadId: MERGE_THREAD,
      sourceMessageId: source,
    });
    insertAiJob(store, {
      id: 'job-keeper',
      kind: 'oneLiner',
      status: 'queued',
      input: oneLiner('msg-k'),
      source: 'msg-k',
    });
    insertAiJob(store, {
      id: 'job-colliding',
      kind: 'oneLiner',
      status: 'running',
      input: oneLiner('msg-l'),
      source: 'msg-l',
    });
    insertAiJob(store, {
      id: 'job-done',
      kind: 'oneLiner',
      status: 'done',
      input: oneLiner('msg-m'),
      source: 'msg-m',
    });
    insertAiJob(store, {
      id: 'job-task',
      kind: 'automationTask',
      status: 'done',
      input: {
        kind: 'automationTask',
        threadId: MERGE_THREAD,
        messageId: 'msg-m',
        automationId: 'aut-1',
        instructions: null,
        jiraKey: null,
      },
      output: {
        kind: 'automationDraft',
        threadId: MERGE_THREAD,
        messageId: 'msg-l',
        body: 'Ďakujem',
      },
    });

    await mergeGroup();

    const jobs = rows(
      `select id, source_message_id as source, json_extract(input, '$.sourceMessageId') as input,
       json_extract(input, '$.messageId') as task, json_extract(output, '$.messageId') as output
       from ai_jobs order by id`,
    );
    expect(jobs).toEqual([
      { id: 'job-colliding', source: 'msg-l', input: 'msg-l', task: null, output: null },
      { id: 'job-done', source: 'msg-k', input: 'msg-k', task: null, output: null },
      { id: 'job-keeper', source: 'msg-k', input: 'msg-k', task: null, output: null },
      { id: 'job-task', source: null, input: null, task: 'msg-k', output: 'msg-k' },
    ]);
    expectMergeInvariants(store);
    expectNoLoserReferences(store, LOSERS, ['msg-l']);
  });

  it('gives a free active AI job slot to the first loser job in table order', async () => {
    const oneLiner = (source: string) => ({
      kind: 'oneLiner',
      threadId: MERGE_THREAD,
      sourceMessageId: source,
    });
    ['msg-l', 'msg-m'].forEach((source) => {
      insertAiJob(store, {
        id: `job-${source}`,
        kind: 'oneLiner',
        status: 'queued',
        input: oneLiner(source),
        source,
      });
    });

    await mergeGroup();

    expect(
      rows(
        `select id, source_message_id as source, json_extract(input, '$.sourceMessageId') as input
         from ai_jobs order by id`,
      ),
    ).toEqual([
      { id: 'job-msg-l', source: 'msg-k', input: 'msg-k' },
      { id: 'job-msg-m', source: 'msg-m', input: 'msg-m' },
    ]);
    expectMergeInvariants(store);
  });

  it('re-points older aliases when a keeper is merged again', async () => {
    await mergeGroup();
    const { inbox, allMail } = account.boxes;
    store.database.sqlite.exec(
      `delete from message_placements where message_id = 'msg-k' and mailbox_id = '${inbox.id}';
       update messages set mailbox_id = '${allMail.id}', uid = 7 where id = 'msg-k'`,
    );
    insertCopy(store, account, { id: 'msg-new', mailbox: inbox, uid: 30 });

    const report = await mergeGroup();

    expect(report.merged).toEqual([
      { emailId: 'gm-1', keeperId: 'msg-new', loserIds: ['msg-k'], threadId: MERGE_THREAD },
    ]);
    expect(
      rows('select alias_id as alias, message_id as id from message_aliases order by 1'),
    ).toEqual([
      { alias: 'msg-k', id: 'msg-new' },
      { alias: 'msg-l', id: 'msg-new' },
      { alias: 'msg-m', id: 'msg-new' },
    ]);
    const resolved = await store.repositories.messages.findById(LOCAL_USER_ID, messageId('msg-l'));
    expect(resolved?.id).toBe('msg-new');
    expectMergeInvariants(store);
  });
});
