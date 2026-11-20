import { describe, expect, it } from 'vitest';
import { addAutomations, automationInput } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { GMAIL_FIRST, gmailMoveThread, inboxAndAllMail } from '../support/gmail-move-setup';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, USER_ID } from '../support/test-engine';

const HOUR_MS = 60 * 60_000;

const labelledReply = (server: FakeMailServer) => {
  deliverMail(server, 'Archive', {
    id: 'g0',
    labels: ['Klienti'],
    emailId: 'gm-0',
    date: '2026-11-13T08:00:00.000Z',
  });
  inboxAndAllMail(server, { ...GMAIL_FIRST, inReplyTo: 'g0' });
};

const labelledInboxMail = (server: FakeMailServer) => {
  inboxAndAllMail(server, { ...GMAIL_FIRST, labels: ['\\Inbox', 'Klienti'] });
  inboxAndAllMail(server, {
    id: 'g2',
    labels: ['\\Inbox'],
    emailId: 'gm-2',
    inReplyTo: 'g1',
    date: '2026-11-14T09:00:00.000Z',
  });
};

const movedThread = async (deliver: (server: FakeMailServer) => void = inboxAndAllMail) => {
  const engine = createTestEngine();
  const setup = await gmailMoveThread(engine, deliver);
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

  it('keeps the label on mail that had it before the move', async () => {
    const { engine, thread, label, undo } = await movedThread(labelledReply);
    engine.clock.advance(2 * HOUR_MS);

    const result = await undo();

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['undone']);
    const messages = [...engine.db.tables.messages.values()].filter(
      (message) => message.threadId === thread.id,
    );
    const labelled = messages.filter((message) => message.labelIds.includes(label.id));
    expect(labelled.map(({ messageIdHeader }) => messageIdHeader)).toEqual(['<g0@mail.test>']);
    expect(engine.db.tables.threads.get(thread.id)).toMatchObject({
      state: 'inbox',
      labelIds: [label.id],
    });
  });

  it('keeps the label on inbox mail that already had it when the move ran', async () => {
    const { engine, thread, label, undo } = await movedThread(labelledInboxMail);
    engine.clock.advance(2 * HOUR_MS);

    const result = await undo();

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['undone']);
    const headers = [...engine.db.tables.messages.values()]
      .filter((message) => message.threadId === thread.id && message.labelIds.includes(label.id))
      .map(({ messageIdHeader }) => messageIdHeader);
    expect(new Set(headers)).toEqual(new Set(['<g1@mail.test>']));
    expect(engine.db.tables.threads.get(thread.id)?.state).toBe('inbox');
  });
});
