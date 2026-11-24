import { describe, expect, it } from 'vitest';
import { folderSetup, saveRule, syncNow, threadBySubject } from '../support/automation-filters';
import { onlyEntry, undoEntry } from '../support/automation-history';
import { TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';
import { placedAt } from '../support/memory/memory-placements';

const HOUR_MS = 60 * 60_000;

describe('rule history when a step around the action fails', () => {
  it('keeps a committed mark read when publishing afterwards fails', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const rule = await saveRule(setup, { actions: [{ type: 'markRead' }] });
    setup.engine.events.failing = 'mailboxes.updated';

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });

    setup.engine.events.failing = null;
    const entry = await onlyEntry(setup, rule);
    expect(entry.actions).toMatchObject([{ outcome: 'ok' }]);
    expect(present(entry.actions[0]).changed).toHaveLength(1);
    await expect(undoEntry(setup, rule, entry)).resolves.toMatchObject({
      results: [{ outcome: 'undone' }],
    });
    expect(threadBySubject(setup.engine, 'Faktúra 1').unread).toBe(true);
  });

  it('keeps a committed archive when publishing the thread afterwards fails', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const rule = await saveRule(setup, { actions: [{ type: 'archive' }] });
    setup.engine.events.failing = 'thread.upserted';

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });

    setup.engine.events.failing = null;
    const entry = await onlyEntry(setup, rule);
    expect(entry.actions).toMatchObject([{ outcome: 'ok' }]);
    expect(present(entry.actions[0]).changed).toHaveLength(1);
    await expect(undoEntry(setup, rule, entry)).resolves.toMatchObject({
      results: [{ outcome: 'undone' }],
    });
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
  });

  it('does not attribute a concurrent label change to an archive', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'Archive', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'INBOX', {
      id: 'm2',
      from: TIBOR,
      subject: 'Re: Faktúra 1',
      inReplyTo: 'm1',
    });
    await syncNow(setup);
    const rule = await saveRule(setup, { actions: [{ type: 'archive' }] });
    const tables = setup.engine.db.tables;
    const archived = present(
      [...tables.messages.values()].find(
        ({ messageIdHeader }) => messageIdHeader === '<m1@mail.test>',
      ),
    );
    setup.engine.events.beforePublish = (event) => {
      if (event.type !== 'thread.upserted' || event.data.thread.state !== 'done') {
        return;
      }
      tables.messages.set(archived.id, { ...archived, labelIds: [setup.label.id] });
    };

    await setup.engine.services.automations.applyToExisting(USER_ID, rule.id);
    setup.engine.events.beforePublish = null;

    const entry = await onlyEntry(setup, rule);
    expect(present(entry.actions[0]).changed).not.toContain(archived.id);
    await expect(undoEntry(setup, rule, entry)).resolves.toMatchObject({
      results: [{ outcome: 'undone' }],
    });
    expect(setup.server.mailbox('Archive').messages.size).toBe(1);
    expect(setup.server.mailbox('INBOX').messages.size).toBe(1);
  });

  it('returns only recorded mail still in the rule destination', async () => {
    const setup = await folderSetup();
    setup.server.addMailbox('Iné', 'custom');
    await syncNow(setup);
    const other = present(
      await setup.engine.repositories.mailboxes.findByPath(setup.account.id, 'Iné'),
    );
    const rule = await saveRule(setup, {
      actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    deliverMail(setup.server, 'Faktúry', {
      id: 'm2',
      from: TIBOR,
      subject: 'Re: Faktúra 1',
      inReplyTo: 'm1',
    });
    await syncNow(setup);
    const entry = await onlyEntry(setup, rule);
    const [recorded] = present(entry.actions[0]).changed;
    const moved = present(setup.engine.db.tables.messages.get(present(recorded)));
    setup.engine.db.tables.messages.set(
      moved.id,
      placedAt(moved, { ...moved, mailboxId: other.id }),
    );
    setup.engine.clock.advance(2 * HOUR_MS);

    const result = await undoEntry(setup, rule, entry);

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['skipped']);
    expect(setup.engine.db.tables.messages.get(moved.id)?.mailboxId).toBe(other.id);
  });
});
