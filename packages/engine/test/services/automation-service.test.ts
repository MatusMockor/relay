import type { AccountId, AutomationId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { addAutomations, automationInput } from '../support/automations';
import { createTestEngine, OTHER_USER_ID, USER_ID } from '../support/test-engine';

describe('AutomationService', () => {
  it('stores the rules in order and publishes the update', async () => {
    const engine = createTestEngine();

    const saved = await addAutomations(engine, [
      automationInput({ name: 'Druhé', order: 2 }),
      automationInput({ name: 'Prvé', order: 1 }),
    ]);

    expect(saved.map((automation) => automation.name)).toEqual(['Jira tasky', 'Prvé', 'Druhé']);
    expect(saved.every((automation) => automation.userId === USER_ID)).toBe(true);
    expect(engine.events.ofType('automations.updated').at(-1)?.data.automations).toEqual(saved);
    expect(await engine.services.automations.list(OTHER_USER_ID)).toHaveLength(1);
  });

  it('keeps the preset flag when a client edits the default rule', async () => {
    const engine = createTestEngine();
    const [preset] = await engine.services.automations.list(USER_ID);

    const [updated] = await engine.services.automations.replace(USER_ID, {
      automations: [{ ...automationInput(), id: preset?.id, name: 'Moje Jira tasky' }],
    });

    expect(updated).toMatchObject({ id: preset?.id, preset: 'jiraTasks', name: 'Moje Jira tasky' });
  });

  it('rejects invalid patterns, unknown ids and foreign accounts', async () => {
    const engine = createTestEngine();
    const current = await engine.services.automations.list(USER_ID);
    const replace = (input: ReturnType<typeof automationInput>) =>
      engine.services.automations.replace(USER_ID, { automations: [...current, input] });

    await expect(
      replace(
        automationInput({
          conditions: [{ type: 'subjectRegex', pattern: '([', caseSensitive: false }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      replace(automationInput({ id: 'automation_unknown' as AutomationId })),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      replace(automationInput({ accountId: 'account_missing' as AccountId })),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await engine.services.automations.list(USER_ID)).toEqual(current);
  });
});
