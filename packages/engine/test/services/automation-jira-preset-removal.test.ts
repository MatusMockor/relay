import type { Automation } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  automationInput,
  enableJiraTasks,
  JIRA,
  jobsOf,
  sync,
  syncedSetup,
} from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { createTestEngine, OTHER_USER_ID, type TestEngine, USER_ID } from '../support/test-engine';

const presetsOf = (automations: readonly Automation[]) =>
  automations.filter((automation) => automation.preset === 'jiraTasks');

const removePreset = async (engine: TestEngine): Promise<Automation[]> => {
  const current = await engine.services.automations.list(USER_ID);
  return engine.services.automations.replace(USER_ID, {
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
    await engine.services.automations.list(USER_ID);

    const saved = await engine.services.automations.replace(USER_ID, {
      automations: [automationInput()],
    });

    expect(saved.map((automation) => [automation.name, automation.preset])).toEqual([
      ['Od Tibora', null],
    ]);
    expect(engine.events.ofType('automations.updated').at(-1)?.data.automations).toEqual(saved);
    expect(await engine.services.automations.list(USER_ID)).toEqual(saved);
    const replaced = await engine.services.automations.replace(USER_ID, { automations: saved });
    expect(presetsOf(replaced)).toEqual([]);
    expect(presetsOf(await engine.services.automations.list(USER_ID))).toEqual([]);
    expect(presetsOf(await engine.services.automations.list(OTHER_USER_ID))).toHaveLength(1);
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
    const [kept] = await setup.engine.services.automations.replace(USER_ID, {
      automations: [automationInput()],
    });

    const restored = await setup.engine.services.automations.restoreDefault(USER_ID);

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
    expect(await setup.engine.services.automations.list(USER_ID)).toEqual(restored);
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
    const current = await engine.services.automations.list(USER_ID);

    expect(await engine.services.automations.restoreDefault(USER_ID)).toEqual(current);
    expect(presetsOf(await engine.services.automations.list(USER_ID))).toHaveLength(1);
  });

  it('can be removed again after a restore', async () => {
    const engine = createTestEngine();
    await removePreset(engine);
    await engine.services.automations.restoreDefault(USER_ID);

    expect(presetsOf(await removePreset(engine))).toEqual([]);
    expect(presetsOf(await engine.services.automations.list(USER_ID))).toEqual([]);
  });

  it('refuses to restore it when the rule limit is reached', async () => {
    const engine = createTestEngine();
    await engine.services.automations.list(USER_ID);
    const full = Array.from({ length: 50 }, (_, order) =>
      automationInput({ name: `Pravidlo ${String(order)}`, order }),
    );
    await engine.services.automations.replace(USER_ID, { automations: full });

    await expect(engine.services.automations.restoreDefault(USER_ID)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(presetsOf(await engine.services.automations.list(USER_ID))).toEqual([]);
  });
});
