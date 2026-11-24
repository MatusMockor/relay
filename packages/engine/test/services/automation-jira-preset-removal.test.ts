import type { Automation } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  automationInput,
  enableJiraTasks,
  JIRA,
  jobsOf,
  sync,
  syncedSetup,
  listRules,
  replaceRules,
  restoreRules,
} from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { createTestEngine, OTHER_USER_ID, type TestEngine, USER_ID } from '../support/test-engine';

const presetsOf = (automations: readonly Automation[]) =>
  automations.filter((automation) => automation.preset === 'jiraTasks');

const removePreset = async (engine: TestEngine): Promise<Automation[]> => {
  const current = await listRules(engine, USER_ID);
  return replaceRules(engine, USER_ID, {
    automations: current.filter((automation) => automation.preset === null),
  });
};

const tasks = async (engine: TestEngine) =>
  (await engine.services.tasks.list(USER_ID, { limit: 20 })).items;

const jiraMention = (setup: Awaited<ReturnType<typeof syncedSetup>>, id: string, key: string) => {
  deliverMail(setup.server, 'INBOX', {
    id,
    from: JIRA,
    subject: `[${key}] Nová úloha`,
    headers: { 'X-Jira-Event': 'mention' },
  });
};

describe('removing the default Jira tasks automation', () => {
  it('removes it like any other rule and never seeds it again', async () => {
    const engine = createTestEngine();
    await listRules(engine, USER_ID);

    const saved = await replaceRules(engine, USER_ID, {
      automations: [automationInput()],
    });

    expect(saved.map((automation) => [automation.name, automation.preset])).toEqual([
      ['Od Tibora', null],
    ]);
    expect(engine.events.ofType('automations.updated').at(-1)?.data.automations).toEqual(saved);
    expect(await listRules(engine, USER_ID)).toEqual(saved);
    const replaced = await replaceRules(engine, USER_ID, { automations: saved });
    expect(presetsOf(replaced)).toEqual([]);
    expect(presetsOf(await listRules(engine, USER_ID))).toEqual([]);
    expect(presetsOf(await listRules(engine, OTHER_USER_ID))).toHaveLength(1);
  });

  it('creates no Jira tasks once it is removed', async () => {
    const setup = await syncedSetup();
    await enableJiraTasks(setup.engine);
    await removePreset(setup.engine);
    jiraMention(setup, 'j1', 'EF-8');

    await sync(setup);
    await setup.engine.services.ai.processQueued();

    expect(await tasks(setup.engine)).toEqual([]);
    expect(jobsOf(setup.engine, 'automationTask')).toEqual([]);
  });

  it('restores the default rule after it was removed', async () => {
    const setup = await syncedSetup();
    const [kept] = await replaceRules(setup.engine, USER_ID, {
      automations: [automationInput()],
    });

    const restored = await restoreRules(setup.engine, USER_ID);

    expect(restored).toEqual([
      kept,
      expect.objectContaining({
        name: 'Jira tasky',
        enabled: false,
        order: 1,
        preset: 'jiraTasks',
        accountId: null,
        conditions: [{ type: 'jira', projectKeys: [] }],
        actions: [{ type: 'task' }],
        ai: { runner: 'claude', model: null, effort: null, instructions: null },
      }),
    ]);
    expect(setup.engine.events.ofType('automations.updated').at(-1)?.data.automations).toEqual(
      restored,
    );
    expect(await listRules(setup.engine, USER_ID)).toEqual(restored);
    jiraMention(setup, 'j1', 'EF-9');
    await sync(setup);
    expect(await tasks(setup.engine)).toEqual([]);
    await enableJiraTasks(setup.engine);
    jiraMention(setup, 'j2', 'EF-10');
    await sync(setup);
    expect((await tasks(setup.engine)).map((task) => task.jiraKey)).toEqual(['EF-10']);
  });

  it('keeps the rules untouched when the default rule is still there', async () => {
    const engine = createTestEngine();
    const current = await listRules(engine, USER_ID);

    expect(await restoreRules(engine, USER_ID)).toEqual(current);
    expect(presetsOf(await listRules(engine, USER_ID))).toHaveLength(1);
  });

  it('can be removed again after a restore', async () => {
    const engine = createTestEngine();
    await removePreset(engine);
    await restoreRules(engine, USER_ID);

    expect(presetsOf(await removePreset(engine))).toEqual([]);
    expect(presetsOf(await listRules(engine, USER_ID))).toEqual([]);
  });

  it('refuses to restore it when the rule limit is reached', async () => {
    const engine = createTestEngine();
    await listRules(engine, USER_ID);
    const full = Array.from({ length: 50 }, (_, order) =>
      automationInput({ name: `Pravidlo ${String(order)}`, order }),
    );
    await replaceRules(engine, USER_ID, { automations: full });

    await expect(restoreRules(engine, USER_ID)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(presetsOf(await listRules(engine, USER_ID))).toEqual([]);
  });
});
