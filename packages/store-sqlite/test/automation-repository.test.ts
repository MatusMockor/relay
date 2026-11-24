import {
  type Automation,
  AutomationIdSchema,
  LabelIdSchema,
  MailboxIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from '@relay/shared/domain';
import type { PresetAutomation } from '@relay/engine';
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
  match: 'all',
  conditions: [
    { type: 'fromAddress', address: 'tibor@efabrica.sk' },
    { type: 'jiraEvent', kind: 'mention' },
  ],
  exceptions: [],
  ai: { runner: 'codex', model: 'gpt-6-luna', effort: 'low', instructions: 'Iba ak niečo chce.' },
  actions: [{ type: 'task' }, { type: 'notify' }],
  ...overrides,
});

const preset = (userId = LOCAL_USER_ID, id = 'automation-jira'): PresetAutomation => ({
  ...buildAutomation({
    id: automationId(id),
    userId,
    name: 'Jira tasky',
    order: 0,
    conditions: [{ type: 'jira', projectKeys: [] }],
    ai: { runner: 'claude', model: null, effort: null, instructions: null },
    actions: [{ type: 'task' }],
  }),
  preset: 'jiraTasks',
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
    expect(await automations.replaceAll(LOCAL_USER_ID, [])).toEqual([]);
    expect(await automations.listByUser(OTHER_USER)).toHaveLength(1);
  });

  it('stores parameterized move and label actions', async () => {
    const actions: Automation['actions'] = [
      { type: 'addLabel', labelId: LabelIdSchema.parse('lbl-1') },
      { type: 'moveTo', mailboxId: MailboxIdSchema.parse('mbx-1') },
    ];

    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [
      buildAutomation({ accountId: work.account.id, actions }),
    ]);

    expect(await store.repositories.automations.listByUser(LOCAL_USER_ID)).toEqual([
      buildAutomation({ accountId: work.account.id, actions }),
    ]);
  });

  it('keeps a rule from a newer version out of the rules it runs and preserves it on replace', async () => {
    const rule = buildAutomation({ id: automationId('automation-known') });
    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [rule]);
    store.database.sqlite
      .prepare(
        `insert into automations (id, user_id, account_id, name, enabled, position, preset, match, conditions, exceptions, ai, actions)
         values (?, ?, null, ?, 1, 4, null, 'all', ?, '[]', ?, ?)`,
      )
      .run(
        'automation-newer',
        LOCAL_USER_ID,
        'Preložiť',
        JSON.stringify([{ type: 'fromDomain', domain: 'firma.de' }]),
        JSON.stringify(rule.ai),
        JSON.stringify([{ type: 'translate', language: 'de' }]),
      );
    const newer = {
      kind: 'unsupported',
      id: automationId('automation-newer'),
      name: 'Preložiť',
      enabled: true,
      order: 4,
      accountId: null,
    };

    expect(await store.repositories.automations.listByUser(LOCAL_USER_ID)).toEqual([rule]);
    expect(await store.repositories.automations.listUnsupported(LOCAL_USER_ID)).toEqual([newer]);
    await store.repositories.automations.replaceAll(
      LOCAL_USER_ID,
      [],
      [{ id: newer.id, order: 0 }],
    );
    expect(await store.repositories.automations.listByUser(LOCAL_USER_ID)).toEqual([]);
    expect(await store.repositories.automations.listUnsupported(LOCAL_USER_ID)).toEqual([
      { ...newer, order: 0 },
    ]);
    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [rule]);
    expect(await store.repositories.automations.listUnsupported(LOCAL_USER_ID)).toEqual([
      { ...newer, order: 0 },
    ]);
  });

  it('stores reminder, forward and AI reply draft actions', async () => {
    const actions: Automation['actions'] = [
      { type: 'draftReply' },
      { type: 'forward', to: 'uctovnicka@firma.sk' },
      { type: 'remind', afterDays: 7 },
    ];

    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [
      buildAutomation({ accountId: work.account.id, actions }),
    ]);

    expect((await store.repositories.automations.listByUser(LOCAL_USER_ID))[0]?.actions).toEqual(
      actions,
    );
  });

  it('stores the match mode, exceptions and subject contains conditions', async () => {
    const rule = buildAutomation({
      accountId: work.account.id,
      match: 'any',
      conditions: [
        { type: 'subjectContains', value: 'faktúra' },
        { type: 'fromDomain', domain: 'dodavatel.sk' },
      ],
      exceptions: [{ type: 'fromAddress', address: 'noreply@firma.sk' }, { type: 'hasAttachment' }],
    });

    await store.repositories.automations.replaceAll(LOCAL_USER_ID, [rule]);

    expect(await store.repositories.automations.listByUser(LOCAL_USER_ID)).toEqual([rule]);
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

  it('remembers a removed preset per user until it is restored', async () => {
    const { automations } = store.repositories;
    await automations.createPresetIfAbsent(preset());
    await automations.replaceAll(LOCAL_USER_ID, []);

    await automations.markPresetRemoved(LOCAL_USER_ID, 'jiraTasks');
    await automations.markPresetRemoved(LOCAL_USER_ID, 'jiraTasks');

    expect(await automations.isPresetRemoved(LOCAL_USER_ID, 'jiraTasks')).toBe(true);
    expect(await automations.isPresetRemoved(OTHER_USER, 'jiraTasks')).toBe(false);
    await automations.restorePreset(preset(LOCAL_USER_ID, 'automation-jira-2'));
    expect(await automations.isPresetRemoved(LOCAL_USER_ID, 'jiraTasks')).toBe(false);
    expect(await automations.listByUser(LOCAL_USER_ID)).toEqual([
      preset(LOCAL_USER_ID, 'automation-jira-2'),
    ]);
  });

  it('restores a preset without duplicating one that still exists', async () => {
    const { automations } = store.repositories;
    await automations.createPresetIfAbsent(preset());

    await automations.restorePreset(preset(LOCAL_USER_ID, 'automation-jira-2'));

    expect(await automations.listByUser(LOCAL_USER_ID)).toEqual([preset()]);
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
