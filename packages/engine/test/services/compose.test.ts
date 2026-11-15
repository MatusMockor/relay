import type { DraftContent } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const PETER = { name: 'Peter Kral', email: 'peter@partner.test' };

const setup = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  deliverMail(seeded.server, 'INBOX', { id: 'm1', subject: 'Offer' });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const thread = present(
    (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items[0],
  );
  const [message] = await engine.repositories.messages.listByThread(USER_ID, thread.id);
  const reply: DraftContent = {
    accountId: seeded.account.id,
    to: [PETER],
    cc: [],
    bcc: [],
    subject: 'Re: Offer',
    body: 'Sounds good',
    inReplyToThreadId: thread.id,
    inReplyToMessageId: present(message).id,
    attachments: [],
  };
  engine.events.clear();
  return { ...seeded, thread, reply };
};

describe('ComposeService', () => {
  it('tracks reply drafts on the thread', async () => {
    const engine = createTestEngine();
    const { thread, reply } = await setup(engine);

    const draft = await engine.services.compose.createDraft(USER_ID, reply);
    expect((await engine.repositories.threads.findById(USER_ID, thread.id))?.hasDraft).toBe(true);
    const updated = await engine.services.compose.updateDraft(USER_ID, draft.id, {
      body: 'Edited',
    });
    expect(updated.body).toBe('Edited');
    expect(await engine.services.compose.listDrafts(USER_ID)).toHaveLength(1);

    await engine.services.compose.deleteDraft(USER_ID, draft.id);

    expect((await engine.repositories.threads.findById(USER_ID, thread.id))?.hasDraft).toBe(false);
    expect(engine.events.ofType('draft.upserted')).toHaveLength(2);
    expect(engine.events.ofType('draft.removed').map((event) => event.data.draftId)).toEqual([
      draft.id,
    ]);
  });

  it('sends a reply, saves it to Sent and links it to the thread', async () => {
    const engine = createTestEngine();
    const { server, thread, reply } = await setup(engine);
    const draft = await engine.services.compose.createDraft(USER_ID, reply);

    const response = await engine.services.compose.send(USER_ID, {
      source: 'draft',
      draftId: draft.id,
    });

    expect(response).toEqual({
      status: 'sent',
      messageIdHeader: '<sent-1@relay.test>',
      threadId: thread.id,
    });
    const [sent] = engine.sender.sent;
    expect(sent?.message).toMatchObject({
      from: { name: 'Alice Novak', email: 'alice@example.com' },
      inReplyTo: '<m1@mail.test>',
      references: ['<m1@mail.test>'],
      text: 'Sounds good',
    });
    expect(server.mailbox('Sent').messages.size).toBe(1);
    const detail = await engine.services.threads.getDetail(USER_ID, thread.id);
    expect(detail.thread).toMatchObject({ messageCount: 2, state: 'inbox', hasDraft: false });
    expect(await engine.services.compose.listDrafts(USER_ID)).toEqual([]);
    const sentView = await engine.services.inbox.list(USER_ID, { view: 'sent', limit: 50 });
    expect(sentView.items.map((item) => item.id)).toEqual([thread.id]);

    await engine.services.sync.syncAccount(USER_ID, thread.accountId);
    expect(engine.db.tables.messages.size).toBe(2);
  });

  it('sends uploaded attachments', async () => {
    const engine = createTestEngine();
    const { reply } = await setup(engine);
    const attachment = await engine.services.compose.uploadAttachment(USER_ID, {
      filename: 'offer.txt',
      contentType: 'text/plain',
      contentBase64: btoa('hello'),
    });

    await engine.services.compose.send(USER_ID, {
      source: 'inline',
      draft: { ...reply, attachments: [attachment] },
    });

    const outgoing = present(engine.sender.sent[0]).message.attachments;
    expect(outgoing.map((item) => [item.filename, new TextDecoder().decode(item.content)])).toEqual(
      [['offer.txt', 'hello']],
    );
  });

  it('reports a delivered message as sent even when draft cleanup fails', async () => {
    const engine = createTestEngine();
    const { reply } = await setup(engine);
    const attachment = await engine.services.compose.uploadAttachment(USER_ID, {
      filename: 'a.txt',
      contentType: 'text/plain',
      contentBase64: btoa('a'),
    });
    const draft = await engine.services.compose.createDraft(USER_ID, {
      ...reply,
      attachments: [attachment],
    });
    engine.attachments.failDeletes = 'disk is read-only';

    const response = await engine.services.compose.send(USER_ID, {
      source: 'draft',
      draftId: draft.id,
    });

    expect(response.status).toBe('sent');
    expect(engine.sender.sent).toHaveLength(1);
    expect(
      engine.logger.entries.some((entry) => entry.message === 'Removing a sent draft failed'),
    ).toBe(true);
  });

  it('schedules a send and delivers it when due', async () => {
    const engine = createTestEngine();
    const { reply } = await setup(engine);

    const response = await engine.services.compose.send(USER_ID, {
      source: 'inline',
      draft: reply,
      scheduledAt: '2026-11-15T12:00:00.000Z',
    });

    expect(response.status).toBe('scheduled');
    const pending = await engine.services.compose.listScheduled(USER_ID);
    expect(pending.map((item) => item.status)).toEqual(['pending']);
    const scheduledView = await engine.services.inbox.list(USER_ID, {
      view: 'scheduled',
      limit: 50,
    });
    expect(scheduledView.items).toHaveLength(1);
    expect(await engine.services.compose.sendDueScheduled()).toEqual([]);
    expect(engine.sender.sent).toHaveLength(0);

    engine.clock.set('2026-11-15T12:00:01.000Z');
    const processed = await engine.services.compose.sendDueScheduled();

    expect(processed.map((item) => [item.status, item.sentAt])).toEqual([
      ['sent', '2026-11-15T12:00:01.000Z'],
    ]);
    expect(engine.sender.sent).toHaveLength(1);
    expect(await engine.services.compose.listScheduled(USER_ID)).toEqual([]);
    expect(await engine.services.compose.listDrafts(USER_ID)).toEqual([]);
    expect(
      engine.events
        .ofType('scheduledSend.upserted')
        .map((event) => event.data.scheduledSend.status),
    ).toEqual(['pending', 'sent']);
  });

  it('records a failed scheduled send and keeps the draft', async () => {
    const engine = createTestEngine();
    const { reply } = await setup(engine);
    await engine.services.compose.send(USER_ID, {
      source: 'inline',
      draft: reply,
      scheduledAt: '2026-11-15T11:00:00.000Z',
    });
    engine.sender.failSend = 'mailbox full';
    engine.clock.set('2026-11-15T11:30:00.000Z');

    const [failed] = await engine.services.compose.sendDueScheduled();

    expect(failed).toMatchObject({ status: 'failed' });
    expect(failed?.error).toContain('mailbox full');
    expect(await engine.services.compose.listDrafts(USER_ID)).toHaveLength(1);
  });

  it('cancels a pending scheduled send once', async () => {
    const engine = createTestEngine();
    const { reply } = await setup(engine);
    const response = await engine.services.compose.send(USER_ID, {
      source: 'inline',
      draft: reply,
      scheduledAt: '2026-11-15T11:00:00.000Z',
    });
    const scheduled = present(response.status === 'scheduled' ? response.scheduledSend : null);

    await engine.services.compose.cancelScheduled(USER_ID, scheduled.id);

    expect(await engine.services.compose.listScheduled(USER_ID)).toEqual([]);
    await expect(
      engine.services.compose.cancelScheduled(USER_ID, scheduled.id),
    ).rejects.toMatchObject({ code: 'conflict' });
    engine.clock.set('2026-11-15T12:00:00.000Z');
    expect(await engine.services.compose.sendDueScheduled()).toEqual([]);
  });

  it('validates recipients and account ownership', async () => {
    const engine = createTestEngine();
    const { reply } = await setup(engine);

    await expect(
      engine.services.compose.send(USER_ID, { source: 'inline', draft: { ...reply, to: [] } }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      engine.services.compose.createDraft('user_bob' as typeof USER_ID, reply),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
