import { type UnsupportedAutomation, AutomationIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow } from '../support/automation-filters';
import { automationInput, TIBOR } from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const NEWER: UnsupportedAutomation = {
  kind: 'unsupported',
  id: AutomationIdSchema.parse('aut_newer'),
  name: 'Zo zajtrajška',
  enabled: true,
  order: 5,
  accountId: null,
};

describe('rules from a newer Relay version', () => {
  it('lists them, keeps them on replace and never runs them', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'notify' }] });
    setup.engine.db.tables.unsupportedAutomations.set(USER_ID, [NEWER]);
    const { automations } = setup.engine.services;

    expect((await automations.list(USER_ID)).at(-1)).toEqual(NEWER);
    const replaced = await automations.replace(USER_ID, {
      automations: [
        { id: rule.id, keep: true },
        { id: NEWER.id, keep: true },
      ],
    });

    expect(replaced.map((entry) => entry.id)).toEqual([rule.id, NEWER.id]);
    expect(setup.engine.events.ofType('automations.updated').at(-1)?.data.automations).toEqual(
      replaced,
    );
    await expect(
      automations.replace(USER_ID, {
        automations: [{ id: AutomationIdSchema.parse('aut_unknown'), keep: true }],
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(automations.applyToExisting(USER_ID, NEWER.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ponuka' });
    await syncNow(setup);
    expect(setup.engine.events.ofType('automation.notified')).toHaveLength(1);
    await automations.replace(USER_ID, { automations: [{ id: rule.id, keep: true }] });
    expect(await automations.list(USER_ID)).not.toContainEqual(NEWER);
  });

  it('keeps a newer rule at its place among the rules around it', async () => {
    const setup = await folderSetup();
    const { automations } = setup.engine.services;
    const [first, second] = (
      await automations.replace(USER_ID, {
        automations: [
          automationInput({ name: 'Prvé', order: 0 }),
          automationInput({ name: 'Druhé', order: 1 }),
        ],
      })
    ).map((entry) => entry.id);
    setup.engine.db.tables.unsupportedAutomations.set(USER_ID, [{ ...NEWER, order: 1 }]);

    const saved = await automations.replace(USER_ID, {
      automations: [
        automationInput({ id: first, name: 'Prvé', order: 0 }),
        { id: NEWER.id, keep: true },
        automationInput({ id: second, name: 'Druhé', order: 2 }),
      ],
    });

    expect(saved.map((entry) => [entry.name, entry.order])).toEqual([
      ['Prvé', 0],
      [NEWER.name, 1],
      ['Druhé', 2],
    ]);
  });

  it('positions every rule by its place in the replace list, whatever order it sends', async () => {
    const setup = await folderSetup();
    const { automations } = setup.engine.services;
    setup.engine.db.tables.unsupportedAutomations.set(USER_ID, [{ ...NEWER, order: 1 }]);

    const saved = await automations.replace(USER_ID, {
      automations: [
        automationInput({ name: 'Prvé', order: 1 }),
        { id: NEWER.id, keep: true },
        automationInput({ name: 'Druhé', order: 1 }),
      ],
    });

    expect(saved.map((entry) => [entry.name, entry.order])).toEqual([
      ['Prvé', 0],
      [NEWER.name, 1],
      ['Druhé', 2],
    ]);
  });

  it('counts newer rules toward the rule limit when restoring the default rule', async () => {
    const setup = await folderSetup();
    const { automations } = setup.engine.services;
    await automations.replace(USER_ID, { automations: [] });
    const newer = (count: number): UnsupportedAutomation[] =>
      Array.from({ length: count }, (_, order) => ({
        ...NEWER,
        id: AutomationIdSchema.parse(`aut_newer_${String(order)}`),
        order,
      }));
    setup.engine.db.tables.unsupportedAutomations.set(USER_ID, newer(50));

    await expect(automations.restoreDefault(USER_ID)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    setup.engine.db.tables.unsupportedAutomations.set(USER_ID, newer(49));
    const restored = await automations.restoreDefault(USER_ID);

    expect(restored).toHaveLength(50);
    expect(restored.at(-1)).toMatchObject({ preset: 'jiraTasks', order: 49 });
  });
});
