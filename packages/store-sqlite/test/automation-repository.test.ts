import {
  type Automation,
  AutomationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const automationId = (value: string) => AutomationIdSchema.parse(value);
const OTHER_USER = UserIdSchema.parse('user-other');

const buildAutomation = (overrides: Partial<Automation> = {}): Automation => ({
  id: automationId('automation-1'),
  userId: LOCAL_USER_ID,
  accountId: null,
  name: 'Od Tibora',
  enabled: true,
  order: 1,
  preset: null,
  conditions: [
    { type: 'fromAddress', address: 'tibor@efabrica.sk' },
    { type: 'jiraEvent', kind: 'mention' },
  ],
  ai: { runner: 'codex', model: 'gpt-6-luna', effort: 'low', instructions: 'Iba ak niečo chce.' },
  actions: ['task', 'notify'],
  ...overrides,
});

const preset = (userId = LOCAL_USER_ID, id = 'automation-jira'): Automation =>
  buildAutomation({
    id: automationId(id),
    userId,
    name: 'Jira tasky',
    order: 0,
    preset: 'jiraTasks',
    conditions: [{ type: 'jira', projectKeys: [] }],
    ai: { runner: 'claude', model: null, effort: null, instructions: null },
    actions: ['task'],
  });

describe('SqliteAutomationRepository', () => {
  let store: TestStore;
  let work: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    work = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('replaces the rules of one user and lists them in order', async () => {
    const { automations } = store.repositories;
    await automations.replaceAll(OTHER_USER, [
      buildAutomation({ id: automationId('automation-other'), userId: OTHER_USER }),
    ]);
    await automations.replaceAll(LOCAL_USER_ID, [
      buildAutomation({ id: automationId('automation-2'), order: 2, accountId: work.account.id }),
      buildAutomation(),
    ]);

    const saved = await automations.replaceAll(LOCAL_USER_ID, [
      buildAutomation({ name: 'Premenované', enabled: false }),
    ]);

    expect(saved).toEqual([buildAutomation({ name: 'Premenované', enabled: false })]);
    expect(await automations.listByUser(OTHER_USER)).toHaveLength(1);
  });

  it('creates a preset only once per user', async () => {
    const { automations } = store.repositories;

    await automations.createPresetIfAbsent(preset());
    await automations.createPresetIfAbsent(preset(LOCAL_USER_ID, 'automation-jira-2'));
    await automations.createPresetIfAbsent(preset(OTHER_USER, 'automation-jira-other'));

    expect(await automations.listByUser(LOCAL_USER_ID)).toEqual([preset()]);
    expect((await automations.listByUser(OTHER_USER)).map((item) => item.id)).toEqual([
      'automation-jira-other',
    ]);
  });

  it('removes account scoped rules with their account', async () => {
    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [
      buildAutomation({ accountId: work.account.id }),
    ]);

    await store.repositories.accounts.delete(LOCAL_USER_ID, work.account.id);

    expect(await store.repositories.automations.listByUser(LOCAL_USER_ID)).toEqual([]);
  });
});

describe('SqliteAutomationRunRepository', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.database.close();
  });

  it('claims an automation run for a message only once', async () => {
    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [buildAutomation()]);
    const run = {
      userId: LOCAL_USER_ID,
      automationId: automationId('automation-1'),
      messageId: MessageIdSchema.parse('msg-1'),
      createdAt: '2026-11-17T10:00:00.000Z',
    };

    expect(await store.repositories.automationRuns.claim(run)).toBe(true);
    expect(await store.repositories.automationRuns.claim(run)).toBe(false);
    expect(
      await store.repositories.automationRuns.claim({
        ...run,
        messageId: MessageIdSchema.parse('msg-2'),
      }),
    ).toBe(true);
  });
});
