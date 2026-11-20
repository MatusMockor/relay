import { AutomationActionsSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  failedActions,
  folderSetup,
  saveRule,
  scopedRule,
  syncNow,
  threadBySubject,
} from '../support/automation-filters';
import { onlyEntry, undoEntry } from '../support/automation-history';
import { addAutomations, automationInput, TIBOR } from '../support/automations';
import { deliverMail, ME } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const ACCOUNTANT = 'uctovnicka@firma.test';

describe('forward automation action', () => {
  it('forwards a new mail from the rule account once and leaves no draft behind', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'forward', to: ACCOUNTANT }] });
    deliverMail(setup.server, 'INBOX', {
      id: 'm1',
      from: TIBOR,
      subject: 'Faktúra 7',
      body: 'Posielam faktúru.',
    });

    await syncNow(setup);
    await syncNow(setup);

    expect(setup.engine.sender.sent).toHaveLength(1);
    const [record] = setup.engine.sender.sent;
    expect(record?.account.id).toBe(setup.account.id);
    expect(record?.message).toMatchObject({
      from: { email: ME.email },
      to: [{ name: null, email: ACCOUNTANT }],
      subject: 'Fwd: Faktúra 7',
      inReplyTo: null,
    });
    expect(record?.message.text).toContain('---------- Preposlaná správa ----------');
    expect(record?.message.text).toContain(`Od: ${TIBOR.name} <${TIBOR.email}>`);
    expect(record?.message.text).toContain('Posielam faktúru.');
    expect(record?.message.headers).toEqual({
      'Auto-Submitted': 'auto-forwarded',
      'X-Relay-Automation': 'forward',
    });
    expect(await setup.engine.services.compose.listDrafts(USER_ID)).toEqual([]);
    expect(threadBySubject(setup.engine, 'Faktúra 7').state).toBe('inbox');
    const entry = await onlyEntry(setup, rule);
    expect(entry.actions).toMatchObject([
      { action: { type: 'forward', to: ACCOUNTANT }, outcome: 'ok' },
    ]);
    await expect(undoEntry(setup, rule, entry)).resolves.toMatchObject({
      alreadyUndone: false,
      results: [{ action: { type: 'forward', to: ACCOUNTANT }, outcome: 'notUndoable' }],
      entry: { undoneAt: null },
    });
  });

  it('records a failed send, removes its draft and still runs the other actions', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'forward', to: ACCOUNTANT }, { type: 'markRead' }],
    });
    setup.engine.sender.failSend = 'SMTP is down';
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 8' });

    await syncNow(setup);

    expect(failedActions(setup.engine)).toEqual(['forward']);
    expect(await setup.engine.services.compose.listDrafts(USER_ID)).toEqual([]);
    expect(threadBySubject(setup.engine, 'Faktúra 8').unread).toBe(false);
    expect((await onlyEntry(setup, rule)).actions).toMatchObject([
      { action: { type: 'forward', to: ACCOUNTANT }, outcome: 'failed' },
      { action: { type: 'markRead' }, outcome: 'ok' },
    ]);
  });

  it('never forwards existing mail or mail sent from an own account', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Stará faktúra' });
    await syncNow(setup);
    const forwardOnly = await saveRule(setup, {
      name: 'Len preposlať',
      actions: [{ type: 'forward', to: ACCOUNTANT }],
    });
    const mixed = await saveRule(setup, {
      actions: [{ type: 'forward', to: ACCOUNTANT }, { type: 'markRead' }],
    });

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, forwardOnly.id),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, mixed.id),
    ).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });
    expect((await onlyEntry(setup, mixed)).actions).toMatchObject([
      { action: { type: 'markRead' }, outcome: 'ok' },
    ]);
    const own = await saveRule(setup, {
      name: 'Od seba',
      conditions: [{ type: 'fromAddress', address: ME.email }],
      actions: [{ type: 'forward', to: ACCOUNTANT }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: ME, subject: 'Faktúra od seba' });
    await syncNow(setup);

    expect(setup.engine.sender.sent).toEqual([]);
    expect((await onlyEntry(setup, own)).actions).toMatchObject([
      {
        action: { type: 'forward', to: ACCOUNTANT },
        outcome: 'failed',
        reason: 'Mail z vlastného účtu sa automaticky nepreposiela',
      },
    ]);
  });

  it('refuses a forward on a rule for all accounts or to the address of the rule account', async () => {
    const setup = await folderSetup();

    await expect(
      addAutomations(setup.engine, [
        automationInput({ actions: [{ type: 'forward', to: ACCOUNTANT }] }),
      ]),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      addAutomations(setup.engine, [
        scopedRule(setup, { actions: [{ type: 'forward', to: ME.email.toUpperCase() }] }),
      ]),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(
      AutomationActionsSchema.safeParse([{ type: 'forward', to: 'nie-je-adresa' }]).success,
    ).toBe(false);
  });
});
