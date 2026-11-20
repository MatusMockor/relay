import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow, threadBySubject } from '../support/automation-filters';
import { onlyEntry, undoEntry } from '../support/automation-history';
import { TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const MINUTE_MS = 60_000;

describe('undo of automation moves restores only what the rule moved', () => {
  it('returns only the messages an archive rule archived', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'Archive', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const rule = await saveRule(setup, { actions: [{ type: 'archive' }] });
    deliverMail(setup.server, 'INBOX', {
      id: 'm2',
      from: TIBOR,
      subject: 'Re: Faktúra 1',
      inReplyTo: 'm1',
    });
    await syncNow(setup);
    expect(setup.server.mailbox('Archive').messages.size).toBe(2);
    const entry = await onlyEntry(setup, rule);
    expect(present(entry.actions[0]).changed).toHaveLength(1);

    const result = await undoEntry(setup, rule, entry);

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['undone']);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
    expect(setup.server.mailbox('Archive').messages.size).toBe(1);
    expect(threadBySubject(setup.engine, 'Faktúra 1').state).toBe('inbox');
  });

  it('ignores move records of a later move and returns the moved mail to the inbox', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const thread = threadBySubject(setup.engine, 'Faktúra 1');
    const archive = present(
      await setup.engine.repositories.mailboxes.findByRole(setup.account.id, 'archive'),
    );
    setup.engine.clock.advance(MINUTE_MS);
    await setup.engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: archive.id,
    });
    await setup.engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: setup.folder.id,
    });

    const result = await undoEntry(setup, rule, await onlyEntry(setup, rule));

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['undone']);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
    expect(setup.server.mailbox('Archive').messages.size).toBe(0);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(0);
  });

  it('skips a move from outside the inbox whose records a later move replaced', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const rows = setup.engine.db.tables.automationActivity;
    const row = present(rows[0]);
    rows[0] = {
      ...row,
      actions: row.actions.map((action) => ({ ...action, previousState: 'done' as const })),
    };
    const thread = threadBySubject(setup.engine, 'Faktúra 1');
    const archive = present(
      await setup.engine.repositories.mailboxes.findByRole(setup.account.id, 'archive'),
    );
    setup.engine.clock.advance(MINUTE_MS);
    await setup.engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: archive.id,
    });
    await setup.engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: setup.folder.id,
    });

    const result = await undoEntry(setup, rule, await onlyEntry(setup, rule));

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['skipped']);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(1);
  });
});
