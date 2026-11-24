import type { Automation } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  enableJiraTasks,
  JIRA,
  jobsOf,
  sync,
  syncedSetup,
  listRules,
  replaceRules,
} from '../support/automations';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const preset = async (engine: TestEngine): Promise<Automation> => {
  const automations = await listRules(engine, USER_ID);
  const found = automations.find((automation) => automation.preset === 'jiraTasks');
  expect(found).toBeDefined();
  return found ?? (automations[0] as Automation);
};

const updatePreset = async (engine: TestEngine, change: Partial<Automation>): Promise<void> => {
  const current = await preset(engine);
  await replaceRules(engine, USER_ID, {
    automations: [{ ...current, enabled: true, ...change }],
  });
};

const tasks = async (engine: TestEngine) =>
  (await engine.services.tasks.list(USER_ID, { limit: 20 })).items;

describe('default Jira tasks automation', () => {
  it('is seeded once, turned off, with the existing Jira behavior', async () => {
    const engine = createTestEngine();

    const first = await listRules(engine, USER_ID);
    const second = await listRules(engine, USER_ID);

    expect(second).toEqual(first);
    expect(first).toEqual([
      expect.objectContaining({
        name: 'Jira tasky',
        enabled: false,
        preset: 'jiraTasks',
        accountId: null,
        conditions: [{ type: 'jira', projectKeys: [] }],
        actions: [{ type: 'task' }],
        ai: { runner: 'claude', model: null, effort: null, instructions: null },
      }),
    ]);
  });

  it('creates no Jira tasks for a new user until the rule is turned on', async () => {
    const setup = await syncedSetup();
    deliverMail(setup.server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[EF-10] Pred zapnutím',
      headers: { 'X-Jira-Event': 'assigned' },
    });
    await sync(setup);
    expect(await listRules(setup.engine, USER_ID)).toEqual([
      expect.objectContaining({ preset: 'jiraTasks', enabled: false }),
    ]);
    deliverMail(setup.server, 'INBOX', {
      id: 'j2',
      from: JIRA,
      subject: '[EF-11] Tiež pred zapnutím',
      headers: { 'X-Jira-Event': 'assigned' },
    });
    await sync(setup);
    expect(await tasks(setup.engine)).toEqual([]);

    await enableJiraTasks(setup.engine);
    deliverMail(setup.server, 'INBOX', {
      id: 'j3',
      from: JIRA,
      subject: '[EF-12] Po zapnutí',
      headers: { 'X-Jira-Event': 'assigned' },
    });
    await sync(setup);

    expect((await tasks(setup.engine)).map((task) => task.jiraKey)).toEqual(['EF-12']);
  });

  it('creates and reopens Jira tasks without AI, also on the initial sync', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    await enableJiraTasks(engine);
    deliverMail(server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[EF-1] Platby padajú',
      headers: { 'X-Jira-Event': 'assigned' },
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const [task] = await tasks(engine);
    expect(task).toMatchObject({ jiraKey: 'EF-1', title: 'Platby padajú', source: 'jira' });
    await engine.services.tasks.update(USER_ID, task?.id ?? ('x' as never), { state: 'done' });

    deliverMail(server, 'INBOX', {
      id: 'j2',
      from: JIRA,
      subject: '[EF-1] Platby padajú',
      headers: { 'X-Jira-Event': 'mention' },
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await tasks(engine)).toEqual([expect.objectContaining({ id: task?.id, state: 'open' })]);
    expect(jobsOf(engine, 'automationTask')).toEqual([]);
  });

  it('stops creating Jira tasks when it is turned off', async () => {
    const setup = await syncedSetup();
    await updatePreset(setup.engine, { enabled: false });
    deliverMail(setup.server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[EF-2] Nový bug',
      headers: { 'X-Jira-Event': 'mention' },
    });

    await sync(setup);

    expect(await tasks(setup.engine)).toEqual([]);
  });

  it('only creates Jira tasks for the projects in its conditions', async () => {
    const setup = await syncedSetup();
    await updatePreset(setup.engine, { conditions: [{ type: 'jira', projectKeys: ['EF'] }] });
    const mention = { 'X-Jira-Event': 'mention' };
    deliverMail(setup.server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[EF-3] Áno',
      headers: mention,
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'j2',
      from: JIRA,
      subject: '[OPS-3] Nie',
      headers: mention,
    });

    await sync(setup);

    expect((await tasks(setup.engine)).map((task) => task.jiraKey)).toEqual(['EF-3']);
  });

  it('lets the AI judge Jira mail once instructions are added', async () => {
    const setup = await syncedSetup();
    await updatePreset(setup.engine, {
      ai: {
        runner: 'claude',
        model: null,
        effort: null,
        instructions: 'Presun do sprintu ignoruj.',
      },
    });
    setup.engine.claude.respondWith((request) => {
      if (request.input.kind !== 'automationTask') {
        return [];
      }
      const actionable = request.input.jiraKey === 'EF-4';
      return [
        {
          type: 'completed',
          output: {
            kind: 'automationTask',
            threadId: request.input.threadId,
            actionable,
            title: actionable ? 'Opraviť platby' : '',
            description: actionable ? 'Peter ťa spomenul v EF-4.' : '',
          },
        },
      ];
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[EF-4] Platby',
      headers: { 'X-Jira-Event': 'mention' },
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'j2',
      from: JIRA,
      subject: '[EF-5] Sprint',
      headers: { 'X-Jira-Event': 'status' },
    });

    await sync(setup);
    expect(await tasks(setup.engine)).toEqual([]);
    await setup.engine.services.ai.processQueued();

    expect(await tasks(setup.engine)).toEqual([
      expect.objectContaining({
        jiraKey: 'EF-4',
        title: 'Opraviť platby',
        aiWhat: 'Peter ťa spomenul v EF-4.',
        source: 'jira',
        state: 'open',
      }),
    ]);
  });

  it('can be scoped to one account', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine);
    const current = await preset(engine);

    const saved = await replaceRules(engine, USER_ID, {
      automations: [{ ...current, accountId: account.id }],
    });

    expect(saved).toEqual([{ ...current, accountId: account.id }]);
    expect(await listRules(engine, USER_ID)).toEqual(saved);
  });

  it('only creates Jira tasks for mail on the account it is scoped to', async () => {
    const engine = createTestEngine();
    const scoped = await seedAccount(engine);
    const other = await seedAccount(engine, { email: 'bob@example.com', isPrimary: false });
    await updatePreset(engine, { accountId: scoped.account.id });
    const assigned = { 'X-Jira-Event': 'assigned' };
    deliverMail(scoped.server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[EF-6] Na mojom účte',
      headers: assigned,
    });
    deliverMail(other.server, 'INBOX', {
      id: 'j2',
      from: JIRA,
      subject: '[EF-7] Na inom účte',
      headers: assigned,
    });

    await engine.services.sync.syncAccount(USER_ID, scoped.account.id);
    await engine.services.sync.syncAccount(USER_ID, other.account.id);

    expect((await tasks(engine)).map((task) => task.jiraKey)).toEqual(['EF-6']);
  });
});
