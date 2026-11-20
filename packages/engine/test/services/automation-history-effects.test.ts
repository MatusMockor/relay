import type { AutomationActivityAction } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  type FolderSetup,
  folderSetup,
  saveRule,
  syncNow,
  threadBySubject,
} from '../support/automation-filters';
import { onlyEntry, undoEntry } from '../support/automation-history';
import { TIBOR } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const HOUR_MS = 60 * 60_000;

const rewriteActions = (
  setup: FolderSetup,
  rewrite: (actions: AutomationActivityAction[]) => AutomationActivityAction[],
): void => {
  const rows = setup.engine.db.tables.automationActivity;
  const row = present(rows[0]);
  rows[0] = { ...row, actions: rewrite(row.actions) };
};

const messagesOf = (setup: FolderSetup, subject: string) => {
  const { id } = threadBySubject(setup.engine, subject);
  return [...setup.engine.db.tables.messages.values()].filter((message) => message.threadId === id);
};

describe('undo of automation runs keeps what the rule did not change', () => {
  it('reverses only the flags and labels the rule set', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1', seen: true });
    await syncNow(setup);
    const thread = threadBySubject(setup.engine, 'Faktúra 1');
    await setup.engine.services.actions.pin(USER_ID, thread.id);
    const rule = await saveRule(setup, {
      actions: [
        { type: 'markRead' },
        { type: 'pin' },
        { type: 'addLabel', labelId: setup.label.id },
      ],
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'm2',
      from: TIBOR,
      subject: 'Re: Faktúra 1',
      inReplyTo: 'm1',
      seen: true,
      keywords: ['Clients'],
    });
    await syncNow(setup);
    const entry = await onlyEntry(setup, rule);
    expect(entry.actions.map(({ changed }) => changed.length)).toEqual([0, 1, 1]);

    const result = await undoEntry(setup, rule, entry);

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['skipped', 'undone', 'undone']);
    const messages = messagesOf(setup, 'Faktúra 1');
    const byHeader = (id: string) =>
      present(messages.find((message) => message.messageIdHeader === `<${id}@mail.test>`));
    expect(byHeader('m1')).toMatchObject({ flags: { seen: true, flagged: true }, labelIds: [] });
    expect(byHeader('m2')).toMatchObject({
      flags: { seen: true, flagged: false },
      labelIds: [setup.label.id],
    });
  });

  it('keeps the reversals of an earlier attempt and finishes the rest on retry', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'markRead' }, { type: 'addLabel', labelId: setup.label.id }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const thread = threadBySubject(setup.engine, 'Faktúra 1');
    rewriteActions(setup, (actions) =>
      actions.map((entry) => ({
        ...entry,
        undo: entry.action.type === 'addLabel' ? 'undone' : 'failed',
      })),
    );

    const result = await undoEntry(setup, rule, await onlyEntry(setup, rule));

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['undone', 'undone']);
    expect(result.entry.undoneAt).not.toBeNull();
    expect(threadBySubject(setup.engine, 'Faktúra 1')).toMatchObject({
      unread: true,
      labelIds: [setup.label.id],
    });
    expect(thread.labelIds).toEqual([setup.label.id]);
  });

  it('leaves a moved thread alone when it was not in the inbox before the move', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, {
      actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
    });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    rewriteActions(setup, (actions) =>
      actions.map((entry) => ({ ...entry, previousState: 'done' })),
    );
    setup.engine.clock.advance(2 * HOUR_MS);

    const result = await undoEntry(setup, rule, await onlyEntry(setup, rule));

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['skipped']);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(1);
    expect(threadBySubject(setup.engine, 'Faktúra 1').state).toBe('done');
  });

  it('skips an archive the user later filed into a folder', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'archive' }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const thread = threadBySubject(setup.engine, 'Faktúra 1');
    await setup.engine.services.actions.apply(USER_ID, thread.id, {
      type: 'move',
      mailboxId: setup.folder.id,
    });

    const result = await undoEntry(setup, rule, await onlyEntry(setup, rule));

    expect(result.results.map(({ outcome }) => outcome)).toEqual(['skipped']);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(1);
  });

  it('does not offer to undo a rule that changed nothing', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup, { actions: [{ type: 'markRead' }] });
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1', seen: true });
    await syncNow(setup);

    const entry = await onlyEntry(setup, rule);

    expect(entry.actions).toMatchObject([{ outcome: 'ok', changed: [] }]);
    await expect(
      setup.engine.services.automationHistory.undoSince(USER_ID, rule.id, entry.createdAt),
    ).resolves.toEqual({ entries: 0, undone: 0, failed: 0 });
  });
});
