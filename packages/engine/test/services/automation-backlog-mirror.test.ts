import { describe, expect, it } from 'vitest';
import { saveRule, syncNow, threadBySubject } from '../support/automation-filters';
import { historyOf, undoEntry } from '../support/automation-history';
import { countWrites, INVOICES, invoiceSetup, pendingOps } from '../support/backlog-mirror';
import { present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

describe('mirroring an automation applied to existing mail', () => {
  it('mirrors every matched thread through one provider session', async () => {
    const setup = await invoiceSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'markRead' }, { type: 'moveTo', mailboxId: setup.folder.id }],
    });
    const connections = setup.server.connections;
    const writes = countWrites(setup);

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 5, applied: 5, failed: 0 });

    expect(setup.server.connections - connections).toBe(1);
    expect(writes).toEqual({ moves: 1, flags: 1 });
    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
    const moved = [...setup.server.mailbox('Faktúry').messages.values()];
    expect(moved).toHaveLength(5);
    expect(moved.every((record) => record.flags.seen)).toBe(true);
    for (const subject of INVOICES) {
      expect(threadBySubject(setup.engine, subject)).toMatchObject({
        state: 'done',
        unread: false,
      });
    }
    await expect(pendingOps(setup)).resolves.toEqual([]);
  });

  it('archives and labels every matched thread through one provider session', async () => {
    const setup = await invoiceSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'addLabel', labelId: setup.label.id }, { type: 'archive' }],
    });
    const connections = setup.server.connections;
    const writes = countWrites(setup);

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 5, applied: 5, failed: 0 });

    expect(setup.server.connections - connections).toBe(1);
    expect(writes.moves).toBe(1);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
    const archived = [...setup.server.mailbox('Archive').messages.values()];
    expect(archived).toHaveLength(5);
    expect(archived.every((record) => record.keywords.includes('Clients'))).toBe(true);
    for (const subject of INVOICES) {
      expect(threadBySubject(setup.engine, subject)).toMatchObject({
        state: 'done',
        labelIds: [setup.label.id],
      });
    }
    await expect(pendingOps(setup)).resolves.toEqual([]);
  });

  it('keeps the local outcome and the pending ops when the provider is unreachable', async () => {
    const setup = await invoiceSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
    });
    setup.server.failConnect = 'Connection refused';

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 5, applied: 5, failed: 0 });

    expect(setup.server.mailbox('INBOX').messages.size).toBe(5);
    for (const subject of INVOICES) {
      expect(threadBySubject(setup.engine, subject).state).toBe('done');
    }
    await expect(pendingOps(setup)).resolves.toHaveLength(5);
    expect(
      setup.engine.logger.entries.filter(
        (entry) => entry.message === 'Mirroring a thread action to the mail provider failed',
      ),
    ).toHaveLength(1);

    setup.server.failConnect = null;
    await syncNow(setup);

    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(5);
    await expect(pendingOps(setup)).resolves.toEqual([]);
  });

  it('records the history only once the provider caught up, so it can be undone', async () => {
    const setup = await invoiceSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'markRead' }, { type: 'archive' }] });
    const recordedAtFlush: number[] = [];
    setup.server.beforeNextConnect = async () => {
      recordedAtFlush.push((await historyOf(setup, rule)).entries.length);
    };

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 5, applied: 5, failed: 0 });

    expect(recordedAtFlush).toEqual([0]);
    const { entries } = await historyOf(setup, rule);
    expect(entries).toHaveLength(5);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
    const entry = present(entries[0]);

    const undone = await undoEntry(setup, rule, entry);

    expect(undone.results.map(({ action, outcome }) => [action.type, outcome])).toEqual([
      ['markRead', 'undone'],
      ['archive', 'undone'],
    ]);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
    expect(threadBySubject(setup.engine, entry.subject).state).toBe('inbox');
  });

  it('still mirrors a live thread action right away', async () => {
    const setup = await invoiceSetup();
    const thread = threadBySubject(setup.engine, 'Faktúra 1');
    const connections = setup.server.connections;

    await setup.engine.services.actions.applyTracked(USER_ID, thread.id, {
      type: 'move',
      mailboxId: setup.folder.id,
    });

    expect(setup.server.connections - connections).toBe(1);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(1);
    await expect(pendingOps(setup)).resolves.toEqual([]);
  });
});
