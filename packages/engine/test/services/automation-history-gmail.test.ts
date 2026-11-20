import { describe, expect, it } from 'vitest';
import { addAutomations, automationInput } from '../support/automations';
import { present } from '../support/fixtures';
import { gmailMoveThread, inboxAndAllMail } from '../support/gmail-move-setup';
import { createTestEngine, USER_ID } from '../support/test-engine';

const HOUR_MS = 60 * 60_000;

const movedThread = async () => {
  const engine = createTestEngine();
  const setup = await gmailMoveThread(engine, inboxAndAllMail);
  const saved = await addAutomations(engine, [
    automationInput({
      accountId: setup.account.id,
      name: 'Klienti',
      conditions: [{ type: 'subjectContains', value: setup.thread.subject }],
      actions: [{ type: 'moveTo', mailboxId: setup.target.id }],
    }),
  ]);
  const automation = present(saved.find((rule) => rule.name === 'Klienti'));
  await engine.services.automations.applyToExisting(USER_ID, automation.id);
  expect(engine.db.tables.threads.get(setup.thread.id)).toMatchObject({
    state: 'done',
    labelIds: [setup.label.id],
  });
  const { entries } = await engine.services.automationHistory.history(USER_ID, automation.id);
  const undo = () =>
    engine.services.automationHistory.undo(USER_ID, automation.id, present(entries[0]).id);
  return { engine, ...setup, undo };
};

describe('undoing an automation move on Gmail', () => {
  it('returns the thread to the inbox and drops the label after the move undo window', async () => {
    const { engine, thread, target, undo } = await movedThread();
    engine.clock.advance(2 * HOUR_MS);

    const result = await undo();

    expect(result.results).toEqual([
      { action: { type: 'moveTo', mailboxId: target.id }, outcome: 'undone' },
    ]);
    expect(engine.db.tables.threads.get(thread.id)).toMatchObject({ state: 'inbox', labelIds: [] });
  });

  it('drops the label of a thread that is already back in the inbox', async () => {
    const { engine, thread, act, undo } = await movedThread();
    engine.clock.advance(2 * HOUR_MS);
    await act({ type: 'undone' });

    const result = await undo();

    expect(result.results.map((item) => item.outcome)).toEqual(['undone']);
    expect(engine.db.tables.threads.get(thread.id)).toMatchObject({ state: 'inbox', labelIds: [] });
  });
});
