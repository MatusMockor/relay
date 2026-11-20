import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow, threadBySubject } from '../support/automation-filters';
import { isFlagged, onlyEntry, undoEntry } from '../support/automation-history';
import { TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const HOUR_MS = 60 * 60_000;

describe('undoing an automation run', () => {
  it('reverses mark read, pin, label and archive and marks the entry undone once', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [
        { type: 'markRead' },
        { type: 'pin' },
        { type: 'addLabel', labelId: setup.label.id },
        { type: 'archive' },
      ],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const before = threadBySubject(setup.engine, 'Faktúra 1');
    expect(before).toMatchObject({ state: 'done', unread: false, labelIds: [setup.label.id] });
    expect(isFlagged(setup.engine, before.id)).toBe(true);
    const entry = await onlyEntry(setup, rule);

    const result = await undoEntry(setup, rule, entry);

    expect(result.alreadyUndone).toBe(false);
    expect(result.entry.undoneAt).toBe(setup.engine.clock.now().toISOString());
    expect(result.results).toEqual([
      { action: { type: 'markRead' }, outcome: 'undone' },
      { action: { type: 'pin' }, outcome: 'undone' },
      { action: { type: 'addLabel', labelId: setup.label.id }, outcome: 'undone' },
      { action: { type: 'archive' }, outcome: 'undone' },
    ]);
    expect(threadBySubject(setup.engine, 'Faktúra 1')).toMatchObject({
      state: 'inbox',
      unread: true,
      labelIds: [],
    });
    expect(isFlagged(setup.engine, before.id)).toBe(false);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
    await expect(undoEntry(setup, rule, entry)).resolves.toMatchObject({
      alreadyUndone: true,
      results: [],
    });
    expect((await onlyEntry(setup, rule)).undoneAt).toBe(result.entry.undoneAt);
  });

  it('returns a moved thread to the inbox inside and after the move undo window', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: TIBOR, subject: 'Faktúra 2' });
    await syncNow(setup);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(2);
    const { entries } = await setup.engine.services.automationHistory.history(USER_ID, rule.id);
    expect(entries).toHaveLength(2);
    const [second, first] = entries.map(present);

    await expect(undoEntry(setup, rule, present(first))).resolves.toMatchObject({
      results: [{ outcome: 'undone' }],
    });
    setup.engine.clock.advance(2 * HOUR_MS);
    await expect(undoEntry(setup, rule, present(second))).resolves.toMatchObject({
      results: [{ outcome: 'undone' }],
    });

    expect(threadBySubject(setup.engine, 'Faktúra 1').state).toBe('inbox');
    expect(threadBySubject(setup.engine, 'Faktúra 2').state).toBe('inbox');
    expect(setup.server.mailbox('INBOX').messages.size).toBe(2);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(0);
  });

  it('returns older folder mail that a move to the inbox pulled in', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'Faktúry', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const inbox = present(
      await setup.engine.repositories.mailboxes.findByRole(setup.account.id, 'inbox'),
    );
    const rule = await saveRule(setup, { actions: [{ type: 'moveTo', mailboxId: inbox.id }] });
    deliverMail(setup.server, 'INBOX', {
      id: 'm2',
      from: TIBOR,
      subject: 'Re: Faktúra 1',
      inReplyTo: 'm1',
    });
    await syncNow(setup);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(0);

    await expect(undoEntry(setup, rule, await onlyEntry(setup, rule))).resolves.toMatchObject({
      results: [{ outcome: 'undone' }],
    });

    expect(setup.server.mailbox('Faktúry').messages.size).toBe(1);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
  });

  it('skips actions whose thread changed and reports actions that cannot be undone', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'notify' }, { type: 'archive' }, { type: 'markRead' }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const thread = threadBySubject(setup.engine, 'Faktúra 1');
    await setup.engine.services.actions.apply(USER_ID, thread.id, { type: 'undone' });
    await setup.engine.services.actions.apply(USER_ID, thread.id, { type: 'markUnread' });

    const result = await undoEntry(setup, rule, await onlyEntry(setup, rule));

    expect(result.results).toEqual([
      { action: { type: 'notify' }, outcome: 'notUndoable' },
      { action: { type: 'markRead' }, outcome: 'skipped' },
      { action: { type: 'archive' }, outcome: 'skipped' },
    ]);
    expect(result.entry.undoneAt).not.toBeNull();
  });

  it('leaves an entry with only non-reversible actions open', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'notify' }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);

    const result = await undoEntry(setup, rule, await onlyEntry(setup, rule));

    expect(result.results).toEqual([{ action: { type: 'notify' }, outcome: 'notUndoable' }]);
    expect(result.entry.undoneAt).toBeNull();
  });

  it('skips the reversible actions of a thread that no longer exists', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'markRead' }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const entry = await onlyEntry(setup, rule);
    setup.engine.db.tables.threads.delete(entry.threadId);

    await expect(undoEntry(setup, rule, entry)).resolves.toMatchObject({
      results: [{ action: { type: 'markRead' }, outcome: 'skipped' }],
    });
  });

  it('undoes every open run of the rule since a time', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'archive' }, { type: 'notify' }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    setup.engine.clock.advance(24 * HOUR_MS);
    const since = setup.engine.clock.now().toISOString();
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: TIBOR, subject: 'Faktúra 2' });
    deliverMail(setup.server, 'INBOX', { id: 'm3', from: TIBOR, subject: 'Faktúra 3' });
    await syncNow(setup);
    const undoSince = () =>
      setup.engine.services.automationHistory.undoSince(USER_ID, rule.id, since);

    await expect(undoSince()).resolves.toEqual({ entries: 2, undone: 2, failed: 0 });
    await expect(undoSince()).resolves.toEqual({ entries: 0, undone: 0, failed: 0 });

    expect(threadBySubject(setup.engine, 'Faktúra 1').state).toBe('done');
    expect(threadBySubject(setup.engine, 'Faktúra 2').state).toBe('inbox');
    expect(threadBySubject(setup.engine, 'Faktúra 3').state).toBe('inbox');
  });

  it('refuses an entry of another rule', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'markRead' }] });
    const other = await saveRule(setup, { name: 'Iné', actions: [{ type: 'pin' }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const entry = await onlyEntry(setup, rule);

    await expect(undoEntry(setup, other, entry)).rejects.toMatchObject({ code: 'not_found' });
  });
});
