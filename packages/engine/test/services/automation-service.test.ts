import type { AccountId, AutomationAction, AutomationId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { folderSetup, scopedRule } from '../support/automation-filters';
import { addAutomations, automationInput } from '../support/automations';
import { present, seedAccount } from '../support/fixtures';
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

  describe('move and label targets', () => {
    it('asks for an account before a rule for all accounts may move or label', async () => {
      const setup = await folderSetup();

      await expect(
        addAutomations(setup.engine, [
          automationInput({ actions: [{ type: 'moveTo', mailboxId: setup.folder.id }] }),
        ]),
      ).rejects.toMatchObject({
        code: 'validation_failed',
        message: 'Pravidlo pre všetky účty nemôže presúvať ani štítkovať, vyber účet',
      });
      await expect(
        addAutomations(setup.engine, [
          automationInput({ actions: [{ type: 'addLabel', labelId: setup.label.id }] }),
        ]),
      ).rejects.toMatchObject({ code: 'validation_failed' });
    });

    it('rejects targets of another account and folders that cannot hold moved mail', async () => {
      const setup = await folderSetup();
      const other = await seedAccount(setup.engine, { email: 'druhy@relay.test' });
      const spam = present(
        await setup.engine.repositories.mailboxes.findByPath(setup.account.id, 'Junk'),
      );
      const save = (accountId: AccountId, action: AutomationAction) =>
        addAutomations(setup.engine, [scopedRule(setup, { accountId, actions: [action] })]);

      await expect(
        save(other.account.id, { type: 'moveTo', mailboxId: setup.folder.id }),
      ).rejects.toMatchObject({ code: 'validation_failed' });
      await expect(
        save(other.account.id, { type: 'addLabel', labelId: setup.label.id }),
      ).rejects.toMatchObject({ code: 'validation_failed' });
      await expect(
        save(setup.account.id, { type: 'moveTo', mailboxId: spam.id }),
      ).rejects.toMatchObject({ code: 'validation_failed' });
      await expect(
        save(setup.account.id, { type: 'addLabel', labelId: setup.label.id }),
      ).resolves.toHaveLength(2);
    });

    it('still saves a rule whose stored folder was deleted later', async () => {
      const setup = await folderSetup();
      const saved = await addAutomations(setup.engine, [
        scopedRule(setup, { actions: [{ type: 'moveTo', mailboxId: setup.folder.id }] }),
      ]);
      setup.server.removeMailbox('Faktúry');
      await setup.engine.services.sync.syncAccount(USER_ID, setup.account.id);

      const renamed = await setup.engine.services.automations.replace(USER_ID, {
        automations: saved.map((item) => ({ ...item, name: `${item.name} upravené` })),
      });

      expect(renamed.map((item) => item.actions)).toContainEqual([
        { type: 'moveTo', mailboxId: setup.folder.id },
      ]);
    });
  });
});
