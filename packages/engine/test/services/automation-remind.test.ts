import { AutomationActionsSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow, threadBySubject } from '../support/automation-filters';
import { onlyEntry, undoEntry } from '../support/automation-history';
import { TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const DAY_MS = 24 * 60 * 60_000;

const reminderOf = async (setup: Awaited<ReturnType<typeof folderSetup>>, subject: string) =>
  setup.engine.repositories.reminders.findActiveByThread(
    USER_ID,
    threadBySubject(setup.engine, subject).id,
  );

describe('remind automation action', () => {
  it('snoozes a new mail for the chosen number of days and keeps it on the server inbox', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'remind', afterDays: 3 }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ponuka' });

    await syncNow(setup);

    const remindAt = new Date(setup.engine.clock.now().getTime() + 3 * DAY_MS).toISOString();
    expect(threadBySubject(setup.engine, 'Ponuka')).toMatchObject({ state: 'reminder', remindAt });
    const reminder = present(await reminderOf(setup, 'Ponuka'));
    expect(reminder.remindAt).toBe(remindAt);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
    expect((await onlyEntry(setup, rule)).actions).toMatchObject([
      {
        action: { type: 'remind', afterDays: 3 },
        outcome: 'ok',
        reminder: { id: reminder.id, remindAt },
      },
    ]);
  });

  it('runs on existing inbox mail and cancels the reminder on undo', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Staršia ponuka' });
    await syncNow(setup);
    const rule = await saveRule(setup, {
      actions: [{ type: 'remind', afterDays: 1 }, { type: 'markRead' }],
    });

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });
    expect(threadBySubject(setup.engine, 'Staršia ponuka').state).toBe('reminder');
    const entry = await onlyEntry(setup, rule);
    expect(entry.source).toBe('apply');

    const undone = await undoEntry(setup, rule, entry);

    expect(undone.results).toEqual([
      { action: { type: 'markRead' }, outcome: 'undone' },
      { action: { type: 'remind', afterDays: 1 }, outcome: 'undone' },
    ]);
    expect(threadBySubject(setup.engine, 'Staršia ponuka')).toMatchObject({
      state: 'inbox',
      remindAt: null,
    });
    expect(await reminderOf(setup, 'Staršia ponuka')).toBeNull();
  });

  it('leaves a fired reminder or one rescheduled minutes later alone on undo', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'remind', afterDays: 2 }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Prvá' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: TIBOR, subject: 'Druhá' });
    await syncNow(setup);
    const { entries } = await setup.engine.services.automationHistory.history(USER_ID, rule.id);
    const bySubject = (subject: string) =>
      present(entries.find((entry) => entry.subject === subject));
    const later = new Date(
      setup.engine.clock.now().getTime() + 2 * DAY_MS + 10 * 60_000,
    ).toISOString();
    await setup.engine.services.actions.apply(USER_ID, threadBySubject(setup.engine, 'Druhá').id, {
      type: 'remind',
      at: later,
    });

    await expect(undoEntry(setup, rule, bySubject('Druhá'))).resolves.toMatchObject({
      results: [{ outcome: 'skipped' }],
    });
    expect(threadBySubject(setup.engine, 'Druhá')).toMatchObject({
      state: 'reminder',
      remindAt: later,
    });
    setup.engine.clock.advance(3 * DAY_MS);
    await setup.engine.services.reminders.fireDue();
    await expect(undoEntry(setup, rule, bySubject('Prvá'))).resolves.toMatchObject({
      results: [{ outcome: 'skipped' }],
    });
    expect(threadBySubject(setup.engine, 'Prvá').state).toBe('inbox');
  });

  it('undoes only the reminder of the rule that set it last', async () => {
    const setup = await folderSetup();
    const sooner = await saveRule(setup, {
      name: 'O dva dni',
      actions: [{ type: 'remind', afterDays: 2 }],
    });
    const later = await saveRule(setup, {
      name: 'O päť dní',
      order: 2,
      actions: [{ type: 'remind', afterDays: 5 }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ponuka' });
    await syncNow(setup);
    const remindAt = new Date(setup.engine.clock.now().getTime() + 5 * DAY_MS).toISOString();
    expect(threadBySubject(setup.engine, 'Ponuka').remindAt).toBe(remindAt);

    await expect(undoEntry(setup, sooner, await onlyEntry(setup, sooner))).resolves.toMatchObject({
      results: [{ outcome: 'skipped' }],
    });
    expect(threadBySubject(setup.engine, 'Ponuka')).toMatchObject({ state: 'reminder', remindAt });
    await expect(undoEntry(setup, later, await onlyEntry(setup, later))).resolves.toMatchObject({
      results: [{ outcome: 'undone' }],
    });
    expect(threadBySubject(setup.engine, 'Ponuka')).toMatchObject({
      state: 'inbox',
      remindAt: null,
    });
  });

  it('refuses a reminder together with a move or archive and out of range days', () => {
    expect(
      AutomationActionsSchema.safeParse([{ type: 'remind', afterDays: 2 }, { type: 'archive' }])
        .success,
    ).toBe(false);
    expect(AutomationActionsSchema.safeParse([{ type: 'remind', afterDays: 31 }]).success).toBe(
      false,
    );
    expect(AutomationActionsSchema.safeParse([{ type: 'remind', afterDays: 0 }]).success).toBe(
      false,
    );
    expect(
      AutomationActionsSchema.safeParse([{ type: 'remind', afterDays: 30 }, { type: 'pin' }])
        .success,
    ).toBe(true);
  });
});
