import type { AutomationActivityRecord } from '@relay/engine';
import {
  AutomationActivityIdSchema,
  AutomationIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
  UserIdSchema,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const AUTOMATION_ID = AutomationIdSchema.parse('automation-1');
const RETENTION = { olderThan: '2026-08-01T00:00:00.000Z', keep: 3 };

const UNDONE_ACTIONS: AutomationActivityRecord['actions'] = [
  {
    action: { type: 'archive' },
    outcome: 'ok',
    changed: [],
    previousState: 'inbox',
    undo: 'undone',
  },
];

const ruleOf = (accountId: AutomationActivityRecord['accountId']) => ({
  id: AUTOMATION_ID,
  userId: LOCAL_USER_ID,
  accountId,
  name: 'Faktúry',
  enabled: true,
  order: 1,
  preset: null,
  match: 'all' as const,
  conditions: [{ type: 'fromAddress' as const, address: 'tibor@efabrica.sk' }],
  exceptions: [],
  ai: { runner: 'claude' as const, model: null, effort: null, instructions: null },
  actions: [{ type: 'archive' as const }],
});

describe('SqliteAutomationActivityRepository', () => {
  let store: TestStore;
  let record: (id: string, createdAt: string) => AutomationActivityRecord;

  beforeEach(async () => {
    store = createTestStore();
    const { account } = await seedAccount(store.repositories);
    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [ruleOf(account.id)]);
    record = (id, createdAt) => ({
      id: AutomationActivityIdSchema.parse(id),
      userId: LOCAL_USER_ID,
      automationId: AUTOMATION_ID,
      accountId: account.id,
      threadId: ThreadIdSchema.parse(`thread-${id}`),
      messageId: MessageIdSchema.parse(`msg-${id}`),
      source: 'live',
      from: { name: 'Tibor', email: 'tibor@efabrica.sk' },
      subject: `Faktúra ${id}`,
      actions: [
        {
          action: { type: 'archive' },
          outcome: 'ok',
          changed: [],
          previousState: 'inbox',
          undo: null,
        },
        {
          action: { type: 'notify' },
          outcome: 'failed',
          changed: [],
          previousState: null,
          undo: null,
        },
      ],
      createdAt,
      undoneAt: null,
    });
  });

  afterEach(() => {
    store.database.close();
  });

  it('round-trips entries newest first with stats since a time', async () => {
    const activity = store.repositories.automationActivity;
    await activity.append(record('a1', '2026-11-18T10:00:00.000Z'), RETENTION);
    await activity.append({ ...record('a2', '2026-11-19T10:00:00.000Z'), from: null }, RETENTION);

    const entries = await activity.listRecent(LOCAL_USER_ID, AUTOMATION_ID, 10);
    expect(entries.map((entry) => entry.id)).toEqual(['a2', 'a1']);
    const { userId: _userId, ...first } = record('a1', '2026-11-18T10:00:00.000Z');
    expect(entries[1]).toEqual(first);
    expect(entries[0]?.from).toBeNull();
    await expect(
      activity.stats(LOCAL_USER_ID, AUTOMATION_ID, '2026-11-19T00:00:00.000Z'),
    ).resolves.toEqual({ runs: 1, failedActions: 1 });
    await expect(
      activity.stats(LOCAL_USER_ID, AUTOMATION_ID, '2026-12-01T00:00:00.000Z'),
    ).resolves.toEqual({ runs: 0, failedActions: 0 });
  });

  it('marks an entry undone once and lists only open entries since a time', async () => {
    const activity = store.repositories.automationActivity;
    await activity.append(record('a1', '2026-11-18T10:00:00.000Z'), RETENTION);
    await activity.append(record('a2', '2026-11-19T10:00:00.000Z'), RETENTION);
    await activity.append(record('a3', '2026-11-19T11:00:00.000Z'), RETENTION);
    const id = AutomationActivityIdSchema.parse('a3');

    await expect(
      activity.recordUndo(LOCAL_USER_ID, id, UNDONE_ACTIONS, '2026-11-19T12:00:00.000Z'),
    ).resolves.toBe(true);
    await expect(
      activity.recordUndo(LOCAL_USER_ID, id, UNDONE_ACTIONS, '2026-11-19T13:00:00.000Z'),
    ).resolves.toBe(false);

    await expect(activity.findById(LOCAL_USER_ID, id)).resolves.toMatchObject({
      actions: UNDONE_ACTIONS,
      undoneAt: '2026-11-19T12:00:00.000Z',
    });
    const open = await activity.listOpenSince(
      LOCAL_USER_ID,
      AUTOMATION_ID,
      '2026-11-19T00:00:00.000Z',
    );
    expect(open.map((entry) => entry.id)).toEqual(['a2']);
  });

  it('keeps entries of other users private', async () => {
    const activity = store.repositories.automationActivity;
    await activity.append(record('a1', '2026-11-18T10:00:00.000Z'), RETENTION);
    const other = UserIdSchema.parse('user-other');
    const id = AutomationActivityIdSchema.parse('a1');

    await expect(activity.findById(other, id)).resolves.toBeNull();
    await expect(activity.listRecent(other, AUTOMATION_ID, 10)).resolves.toEqual([]);
    await expect(
      activity.recordUndo(other, id, UNDONE_ACTIONS, '2026-11-19T12:00:00.000Z'),
    ).resolves.toBe(false);
  });

  it('prunes entries past the retention age and beyond the per rule cap', async () => {
    const activity = store.repositories.automationActivity;
    await activity.append(record('old', '2026-07-01T10:00:00.000Z'), RETENTION);
    await expect(activity.listRecent(LOCAL_USER_ID, AUTOMATION_ID, 10)).resolves.toEqual([]);
    for (const day of ['15', '16', '17', '18']) {
      await activity.append(record(`d${day}`, `2026-11-${day}T10:00:00.000Z`), RETENTION);
    }

    const entries = await activity.listRecent(LOCAL_USER_ID, AUTOMATION_ID, 10);
    expect(entries.map((entry) => entry.id)).toEqual(['d18', 'd17', 'd16']);
  });

  it('drops the history of a removed rule', async () => {
    const activity = store.repositories.automationActivity;
    await activity.append(record('a1', '2026-11-18T10:00:00.000Z'), RETENTION);

    await store.repositories.automations.replaceAll(LOCAL_USER_ID, []);

    await expect(
      activity.findById(LOCAL_USER_ID, AutomationActivityIdSchema.parse('a1')),
    ).resolves.toBeNull();
  });
});
