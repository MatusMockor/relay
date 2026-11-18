import {
  type AutomationAction,
  AutomationIdSchema,
  LabelIdSchema,
  MailboxIdSchema,
} from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { orderedActions } from '../../src/services/automations/automation-action';
import {
  failedActions,
  folderSetup,
  scopedRule,
  syncNow,
  threadBySubject,
} from '../support/automation-filters';
import { addAutomations, notifiedSubjects, TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

describe('automation filters', () => {
  it('orders mail actions so that the move runs last', () => {
    const actions: AutomationAction[] = [
      { type: 'moveTo', mailboxId: MailboxIdSchema.parse('mbx_1') },
      { type: 'addLabel', labelId: LabelIdSchema.parse('lbl_1') },
      { type: 'pin' },
      { type: 'notify' },
      { type: 'markRead' },
      { type: 'summary' },
    ];

    expect(orderedActions(actions).map((action) => action.type)).toEqual([
      'notify',
      'summary',
      'markRead',
      'pin',
      'addLabel',
      'moveTo',
    ]);
  });

  it('labels, flags and then moves new mail into the folder of the rule', async () => {
    const setup = await folderSetup();
    await addAutomations(setup.engine, [
      scopedRule(setup, {
        actions: [
          { type: 'moveTo', mailboxId: setup.folder.id },
          { type: 'addLabel', labelId: setup.label.id },
          { type: 'markRead' },
          { type: 'pin' },
        ],
      }),
    ]);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 12' });

    await syncNow(setup);

    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
    expect([...setup.server.mailbox('Faktúry').messages.values()]).toEqual([
      expect.objectContaining({
        flags: { seen: true, flagged: true, answered: false },
        keywords: ['Clients'],
      }),
    ]);
    expect(threadBySubject(setup.engine, 'Faktúra 12')).toMatchObject({
      state: 'done',
      unread: false,
      labelIds: [setup.label.id],
    });
    expect(failedActions(setup.engine)).toEqual([]);
  });

  it('logs a move to a deleted folder and still runs the other actions', async () => {
    const setup = await folderSetup();
    await addAutomations(setup.engine, [
      scopedRule(setup, {
        actions: [{ type: 'moveTo', mailboxId: setup.folder.id }, { type: 'markRead' }],
      }),
    ]);
    setup.server.removeMailbox('Faktúry');
    await syncNow(setup);
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 13' });

    await syncNow(setup);

    expect(failedActions(setup.engine)).toEqual(['moveTo']);
    expect(threadBySubject(setup.engine, 'Faktúra 13')).toMatchObject({
      state: 'inbox',
      unread: false,
    });
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
  });

  it('matches the recipients of new mail', async () => {
    const setup = await folderSetup();
    await addAutomations(setup.engine, [
      scopedRule(setup, {
        conditions: [{ type: 'recipient', field: 'to', match: 'domain', value: 'firma.test' }],
      }),
    ]);
    deliverMail(setup.server, 'INBOX', {
      id: 'm1',
      subject: 'Pre tím',
      to: [{ name: 'Tím', email: 'tim@firma.test' }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm2', subject: 'Len pre mňa' });

    await syncNow(setup);

    expect(notifiedSubjects(setup.engine)).toEqual(['Pre tím']);
  });

  it('applies a rule to matching inbox mail once', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: TIBOR, subject: 'Faktúra 2' });
    deliverMail(setup.server, 'INBOX', { id: 'm3', subject: 'Obed' });
    await syncNow(setup);
    const [rule] = (
      await addAutomations(setup.engine, [
        scopedRule(setup, { actions: [{ type: 'markRead' }, { type: 'notify' }] }),
      ])
    ).filter((automation) => automation.preset === null);
    const apply = () =>
      setup.engine.services.automations.applyToExisting(USER_ID, present(rule).id);

    await expect(apply()).resolves.toEqual({ matched: 2, applied: 2 });
    const first = threadBySubject(setup.engine, 'Faktúra 1');
    await setup.engine.services.actions.apply(USER_ID, first.id, { type: 'markUnread' });

    await expect(apply()).resolves.toEqual({ matched: 2, applied: 0 });
    expect(threadBySubject(setup.engine, 'Faktúra 1').unread).toBe(true);
    expect(threadBySubject(setup.engine, 'Faktúra 2').unread).toBe(false);
    expect(threadBySubject(setup.engine, 'Obed').unread).toBe(true);
    expect(notifiedSubjects(setup.engine)).toEqual([]);
  });

  it('moves existing inbox mail and skips mail that already left the inbox', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'Faktúry', { id: 'm2', from: TIBOR, subject: 'Faktúra 2' });
    await syncNow(setup);
    const [rule] = (
      await addAutomations(setup.engine, [
        scopedRule(setup, { actions: [{ type: 'moveTo', mailboxId: setup.folder.id }] }),
      ])
    ).filter((automation) => automation.preset === null);

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, present(rule).id),
    ).resolves.toEqual({ matched: 1, applied: 1 });

    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(2);
  });

  it('refuses to apply a rule without mail actions to existing mail', async () => {
    const setup = await folderSetup();
    const [rule] = (await addAutomations(setup.engine, [scopedRule(setup)])).filter(
      (automation) => automation.preset === null,
    );

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, present(rule).id),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      setup.engine.services.automations.applyToExisting(
        USER_ID,
        AutomationIdSchema.parse('automation_missing'),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
