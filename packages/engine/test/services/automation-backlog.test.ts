import { AutomationIdSchema, LabelIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  failedActions,
  folderSetup,
  saveRule,
  syncNow,
  threadBySubject,
} from '../support/automation-filters';
import { JIRA, notifiedSubjects, TIBOR } from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

describe('applying an automation to existing mail', () => {
  it('applies a rule to matching inbox mail once', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'INBOX', { id: 'm2', from: TIBOR, subject: 'Faktúra 2' });
    deliverMail(setup.server, 'INBOX', { id: 'm3', subject: 'Obed' });
    await syncNow(setup);
    const rule = await saveRule(setup, { actions: [{ type: 'markRead' }, { type: 'notify' }] });
    const apply = () => setup.engine.services.automations.applyToExisting(USER_ID, rule.id);

    await expect(apply()).resolves.toEqual({ matched: 2, applied: 2, failed: 0 });
    const first = threadBySubject(setup.engine, 'Faktúra 1');
    await setup.engine.services.actions.apply(USER_ID, first.id, { type: 'markUnread' });

    await expect(apply()).resolves.toEqual({ matched: 2, applied: 0, failed: 0 });
    expect(threadBySubject(setup.engine, 'Faktúra 1').unread).toBe(true);
    expect(threadBySubject(setup.engine, 'Faktúra 2').unread).toBe(false);
    expect(threadBySubject(setup.engine, 'Obed').unread).toBe(true);
    expect(notifiedSubjects(setup.engine)).toEqual([]);
  });

  it('moves existing inbox mail and skips mail that already left the inbox', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'Faktúry', { id: 'm2', from: TIBOR, subject: 'Faktúra 2' });
    await syncNow(setup);
    const rule = await saveRule(setup, {
      actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
    });

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });

    expect(setup.server.mailbox('INBOX').messages.size).toBe(0);
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(2);
  });

  it('reports a failed action and retries the thread on the next apply', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const gmail = await setup.engine.repositories.labels.upsert({
      ...setup.label,
      id: LabelIdSchema.parse('label_gmail_clients'),
      name: 'Klienti',
      kind: 'gmail',
      remoteName: 'Klienti',
    });
    const rule = await saveRule(setup, {
      actions: [{ type: 'addLabel', labelId: gmail.id }, { type: 'markRead' }],
    });
    const apply = () => setup.engine.services.automations.applyToExisting(USER_ID, rule.id);

    await expect(apply()).resolves.toEqual({ matched: 1, applied: 0, failed: 1 });
    expect(failedActions(setup.engine)).toEqual(['addLabel']);
    expect(threadBySubject(setup.engine, 'Faktúra 1').unread).toBe(false);
    await setup.engine.repositories.labels.upsert({ ...gmail, kind: 'keyword' });
    expect((await setup.engine.repositories.labels.findById(USER_ID, gmail.id))?.kind).toBe(
      'keyword',
    );

    await expect(apply()).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });
    expect(threadBySubject(setup.engine, 'Faktúra 1').labelIds).toEqual([gmail.id]);
    await expect(apply()).resolves.toEqual({ matched: 1, applied: 0, failed: 0 });
  });

  it('matches existing Jira mail by the event kind of each message', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', {
      id: 'j1',
      from: JIRA,
      subject: '[EF-1] Platby padajú',
      headers: { 'X-Jira-Event': 'mention' },
    });
    deliverMail(setup.server, 'INBOX', {
      id: 'j2',
      from: JIRA,
      subject: '[EF-2] Zmena stavu',
      headers: { 'X-Jira-Event': 'status' },
    });
    await syncNow(setup);
    const mentions = await saveRule(setup, {
      name: 'Spomenutia',
      conditions: [{ type: 'jiraEvent', kind: 'mention' }],
      actions: [{ type: 'markRead' }],
    });
    const others = await saveRule(setup, {
      name: 'Ostatné',
      conditions: [{ type: 'jiraEvent', kind: 'other' }],
      actions: [{ type: 'archive' }],
    });

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, mentions.id),
    ).resolves.toEqual({ matched: 1, applied: 1, failed: 0 });
    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, others.id),
    ).resolves.toEqual({ matched: 0, applied: 0, failed: 0 });

    expect(threadBySubject(setup.engine, '[EF-1] Platby padajú')).toMatchObject({
      unread: false,
      state: 'inbox',
    });
    expect(threadBySubject(setup.engine, '[EF-2] Zmena stavu')).toMatchObject({
      unread: true,
      state: 'inbox',
    });
  });

  it('runs a thread once when two applies race', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    deliverMail(setup.server, 'INBOX', {
      id: 'm2',
      from: TIBOR,
      subject: 'Re: Faktúra 1',
      inReplyTo: 'm1',
    });
    await syncNow(setup);
    const rule = await saveRule(setup, { actions: [{ type: 'pin' }] });
    const apply = () => setup.engine.services.automations.applyToExisting(USER_ID, rule.id);

    const results = await Promise.all([apply(), apply()]);

    expect(results).toEqual([
      { matched: 1, applied: 1, failed: 0 },
      { matched: 1, applied: 0, failed: 0 },
    ]);
  });

  it('skips a thread that left the inbox after it was matched', async () => {
    const setup = await folderSetup();
    deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Faktúra 1' });
    await syncNow(setup);
    const rule = await saveRule(setup, {
      actions: [{ type: 'moveTo', mailboxId: setup.folder.id }],
    });
    const thread = threadBySubject(setup.engine, 'Faktúra 1');
    const candidates = setup.engine.repositories.automationCandidates;
    const listInbox = candidates.listInbox.bind(candidates);
    Object.assign(candidates, {
      listInbox: async (...args: Parameters<typeof listInbox>) => {
        const listed = await listInbox(...args);
        await setup.engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
        return listed;
      },
    });

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).resolves.toEqual({ matched: 1, applied: 0, failed: 0 });

    expect(threadBySubject(setup.engine, 'Faktúra 1').state).toBe('trash');
    expect(setup.server.mailbox('Faktúry').messages.size).toBe(0);
  });

  it('refuses to apply a rule without mail actions to existing mail', async () => {
    const setup = await folderSetup();
    const rule = await saveRule(setup);

    await expect(
      setup.engine.services.automations.applyToExisting(USER_ID, rule.id),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      setup.engine.services.automations.applyToExisting(
        USER_ID,
        AutomationIdSchema.parse('automation_missing'),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
