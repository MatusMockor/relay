import { type UnsupportedAutomation, AutomationIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow } from '../support/automation-filters';
import { TIBOR } from '../support/automations';
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
});
