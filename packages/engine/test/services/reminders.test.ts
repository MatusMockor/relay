import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const threadInInbox = async (engine: TestEngine) => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return present(page.items[0]);
};

describe('ReminderService', () => {
  it('snoozes a thread and brings it back when the reminder fires', async () => {
    const engine = createTestEngine();
    const thread = await threadInInbox(engine);

    const snoozed = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'remind',
      at: '2026-11-16T08:00:00+01:00',
    });

    expect(snoozed).toMatchObject({ state: 'reminder', remindAt: '2026-11-16T07:00:00.000Z' });
    const reminders = await engine.services.inbox.list(USER_ID, { view: 'reminders', limit: 50 });
    expect(reminders.items.map((item) => item.id)).toEqual([thread.id]);
    expect(await engine.services.reminders.fireDue()).toEqual([]);

    engine.clock.set('2026-11-16T07:00:00.000Z');
    const fired = await engine.services.reminders.fireDue();

    expect(fired.map((item) => [item.id, item.state, item.remindAt])).toEqual([
      [thread.id, 'inbox', null],
    ]);
    expect(await engine.services.reminders.fireDue()).toEqual([]);
    const inbox = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(inbox.items.map((item) => item.id)).toEqual([thread.id]);
    expect(engine.events.ofType('thread.upserted').at(-1)?.data.thread.state).toBe('inbox');
  });

  it('reschedules the same reminder and cancels it', async () => {
    const engine = createTestEngine();
    const thread = await threadInInbox(engine);
    await engine.services.reminders.schedule(USER_ID, thread.id, '2026-11-16T08:00:00.000Z');
    await engine.services.reminders.schedule(USER_ID, thread.id, '2026-11-17T08:00:00.000Z');
    expect(engine.db.tables.reminders.size).toBe(1);

    const cancelled = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'cancelReminder',
    });

    expect(cancelled).toMatchObject({ state: 'inbox', remindAt: null });
    expect(engine.db.tables.reminders.size).toBe(0);
  });

  it('keeps trashed threads in the trash when their reminder fires', async () => {
    const engine = createTestEngine();
    const thread = await threadInInbox(engine);
    await engine.services.reminders.schedule(USER_ID, thread.id, '2026-11-16T08:00:00.000Z');
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });

    engine.clock.set('2026-11-17T00:00:00.000Z');
    const [fired] = await engine.services.reminders.fireDue();

    expect(fired).toMatchObject({ state: 'trash', remindAt: null });
  });

  it('rejects reminders in the past', async () => {
    const engine = createTestEngine();
    const thread = await threadInInbox(engine);

    await expect(
      engine.services.reminders.schedule(USER_ID, thread.id, '2026-11-15T09:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});
