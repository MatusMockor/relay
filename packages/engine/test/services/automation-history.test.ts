import { LabelIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow, threadBySubject } from '../support/automation-filters';
import { historyOf, onlyEntry } from '../support/automation-history';
import { TIBOR } from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { OTHER_USER_ID, USER_ID } from '../support/test-engine';

const DAY_MS = 24 * 60 * 60_000;

describe('automation history', () => {
  it('records a live run with the outcome of each action', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [
        { type: 'markRead' },
        { type: 'notify' },
        { type: 'addLabel', labelId: setup.label.id },
      ],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });

    await syncNow(setup);

    const entry = await onlyEntry(setup, rule);
    expect(entry).toMatchObject({
      automationId: rule.id,
      accountId: setup.account.id,
      threadId: threadBySubject(setup.engine, 'Faktúra 1').id,
      source: 'live',
      from: TIBOR,
      subject: 'Faktúra 1',
      undoneAt: null,
      actions: [
        { action: { type: 'notify' }, outcome: 'ok' },
        { action: { type: 'markRead' }, outcome: 'ok' },
        { action: { type: 'addLabel', labelId: setup.label.id }, outcome: 'ok' },
      ],
    });
    await expect(historyOf(setup, rule)).resolves.toMatchObject({
      stats: { days: 30, runs: 1, failedActions: 0, lastRunAt: entry.createdAt },
    });
  });

  it('records apply-to-existing runs and counts failed actions', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: TIBOR, subject: 'Faktúra 2' });
    await syncNow(setup);
    const missing = LabelIdSchema.parse('label_missing');
    const extra = await setup.engine.repositories.labels.upsert({
      ...setup.label,
      id: missing,
      name: 'Klienti',
      remoteName: 'Klienti',
    });
    const rule = await saveRule(setup, {
      actions: [{ type: 'addLabel', labelId: extra.id }, { type: 'markRead' }, { type: 'notify' }],
    });
    await setup.engine.repositories.labels.delete(USER_ID, extra.id);

    await setup.engine.services.automations.applyToExisting(USER_ID, rule.id);

    const history = await historyOf(setup, rule);
    expect(history.stats).toMatchObject({ runs: 2, failedActions: 2 });
    expect(history.entries.map((entry) => entry.source)).toEqual(['apply', 'apply']);
    expect(history.entries[0]?.actions).toEqual([
      { action: { type: 'markRead' }, outcome: 'ok' },
      { action: { type: 'addLabel', labelId: missing }, outcome: 'failed' },
    ]);
  });

  it('lists the newest entries first and prunes entries past the retention', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'markRead' }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    setup.engine.clock.advance(40 * DAY_MS);
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: TIBOR, subject: 'Faktúra 2' });
    await syncNow(setup);

    const history = await historyOf(setup, rule);
    expect(history.entries.map((entry) => entry.subject)).toEqual(['Faktúra 2', 'Faktúra 1']);
    expect(history.stats.runs).toBe(1);

    setup.engine.clock.advance(60 * DAY_MS);
    deliverMail(setup.server, 'INBOX', { id: 'm3', from: TIBOR, subject: 'Faktúra 3' });
    await syncNow(setup);

    const pruned = await historyOf(setup, rule);
    expect(pruned.entries.map((entry) => entry.subject)).toEqual(['Faktúra 3', 'Faktúra 2']);
  });

  it('refuses the history of a rule owned by another user', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'markRead' }] });

    await expect(
      setup.engine.services.automationHistory.history(OTHER_USER_ID, rule.id),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
